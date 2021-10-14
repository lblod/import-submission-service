import { updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeDateTime, sparqlEscapeString, uuid } from 'mu';
import { PREFIXES } from '../constants';
import { attachClonedAuthenticationConfiguraton, cleanCredentials } from './credential-helpers';

//Patched sparqlEscapeUri, see https://github.com/mu-semtech/mu-javascript-template/pull/34/files
const sparqlEscapeUri = function( value ){
  console.log('Warning: using a monkey patched sparqlEscapeUri.');
  return `<${value.replace(/[\\"<>]/g, (match) => `\\${match}`)}>`;
};

export async function scheduleDownloadAttachment(submission, remoteFile){
  const remoteDataId = uuid();
  const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;
  const timestamp = new Date();

  // We need to attach a cloned version of the authentication data, because:
  // 1. donwloadUrl will delete credentials after final state
  // 2. in a later phase, when attachments are fetched, these need to be reused.
  // -> If not cloned, the credentials might not be availible for the download of the attachments
  // Alternative: not delete the credentials after download, but the not always clear when exactly query may be deleted.
  // E.g. after import-submission we're quite sure. But what if something goes wrong before that, or a download just takes longer.
  // The highly aync process makes it complicated
  // Note: probably some clean up background job might be needed. Needs perhaps a bit of better thinking
  const newAuthConf = await attachClonedAuthenticationConfiguraton(remoteDataUri, submission);

  try {
    const queryString = `
      ${PREFIXES}
      INSERT {
        GRAPH ?filesGraph {
         ${sparqlEscapeUri(remoteDataUri)} a nfo:RemoteDataObject, nfo:FileDataObject;
           rpioHttp:requestHeader <http://data.lblod.info/request-headers/29b14d06-e584-45d6-828a-ce1f0c018a8e>;
           mu:uuid ${sparqlEscapeString(remoteDataId)};
           nie:url ${sparqlEscapeUri(remoteFile)};
           dct:creator <http://lblod.data.gift/services/import-submission-service>;
           adms:status <http://lblod.data.gift/file-download-statuses/ready-to-be-cached>;
           dct:created ${sparqlEscapeDateTime(timestamp)};
           dct:modified ${sparqlEscapeDateTime(timestamp)}.

        }
        GRAPH ?submissionGraph {
           ${sparqlEscapeUri(submission)} nie:hasPart ${sparqlEscapeUri(remoteDataUri)}.
        }
      }
      WHERE {
        GRAPH ?submissionGraph {
          ${sparqlEscapeUri(submission)} nie:hasPart ?remoteDataObject.
        }
        GRAPH ?filesGraph {
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
