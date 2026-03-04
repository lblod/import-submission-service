import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeString, uuid, sparqlEscapeUri } from 'mu';
import { JSDOM } from 'jsdom';
import { PREFIXES } from '../constants';
import { attachClonedAuthenticationConfiguraton, cleanCredentials } from './credential-helpers';

const VANDENBROELE_URI = process.env.VANDENBROELE_URI || 'http://data.lblod.info/vendors/b1e41693-639a-4f61-92a9-5b9a3e0b924e';

async function isProvidedByVandenbroele(submission) {
  const result = await query(`
    ${PREFIXES}
    ASK {
      ${sparqlEscapeUri(submission)} pav:providedBy ${sparqlEscapeUri(VANDENBROELE_URI)}.
    }
  `);
  return result.boolean;
}

function extractPotentialFileName(html, remoteFile) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const anchors = document.querySelectorAll(`[href="${remoteFile}"]`);

  for (const anchor of anchors) {
    if (anchor.children.length > 0) continue;

    const text = anchor.textContent.trim().replace(/ /g, '_');
    if (!text) continue;

    const parts = text.split('.');
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      return text;
    }
  }

  return '';
}

export async function scheduleDownloadAttachment(submission, remoteFile, reqState, html){
  const remoteDataId = uuid();
  const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;
  const timestamp = new Date();

  // We need to attach a cloned version of the authentication data, because,
  // download-url service needs this information to perform its actions.
  //
  // We could consider not attaching this information to the remoteData URI, but
  // after the automatic-submission task reached its final statem the credentials are removed (out of security considerations)
  // If by then, download-url hasn't finished successfuly its task, it won't be able to do so anymore
  //
  // Note: probably some clean up background job might be needed. Needs perhaps a bit of better thinking
  const newAuthConf = await attachClonedAuthenticationConfiguraton(remoteDataUri, submission, reqState);

  try {
    let potentialFileName = '';

    const isVandenbroele = await isProvidedByVandenbroele(submission);
    if (isVandenbroele) {
      const potentialFileName = extractPotentialFileName(html, remoteFile);
      if (potentialFileName) {
        potentialFileName = `ext:potentialFileName ${sparqlEscapeString(potentialFileName)};`;
      }
    }

    const queryString = `
      ${PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(reqState.submissionGraph)} {
          ${sparqlEscapeUri(remoteDataUri)} a nfo:RemoteDataObject, nfo:FileDataObject;
            rpioHttp:requestHeader <http://data.lblod.info/request-headers/29b14d06-e584-45d6-828a-ce1f0c018a8e>;
            mu:uuid ${sparqlEscapeString(remoteDataId)};
            nie:url ${sparqlEscapeUri(remoteFile)};
            dct:creator <http://lblod.data.gift/services/import-submission-service>;
            adms:status <http://lblod.data.gift/file-download-statuses/ready-to-be-cached>;
            ${potentialFileName}
            dct:created ${sparqlEscapeDateTime(timestamp)};
            dct:modified ${sparqlEscapeDateTime(timestamp)}.

          ${sparqlEscapeUri(submission)} nie:hasPart ${sparqlEscapeUri(remoteDataUri)}.
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(reqState.submissionGraph)} {
          ${sparqlEscapeUri(submission)} nie:hasPart ?remoteDataObject.
          ?remoteDataObject a ?type.
        }
      }
    `;

      await update(queryString);
      return remoteDataUri;
  }

  catch(e){
    console.error('Something went wrong during the storage of submission');
    console.error(e);
    console.info('Cleaning credentials');
    if(newAuthConf.newAuthConf){
      await cleanCredentials(newAuthConf.newAuthConf);
    }
    throw e;
  }
}
