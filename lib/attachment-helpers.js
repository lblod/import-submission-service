import { updateSudo as update } from '@lblod/mu-auth-sudo';
import { v4 as uuid } from 'uuid';
import * as cts from '../automatic-submission-flow-tools/constants';
import * as rst from 'rdf-string-ttl';
import {
  attachClonedAuthenticationConfiguraton,
  cleanCredentials,
} from './credential-helpers';
import * as N3 from 'n3';
const { namedNode, literal } = N3.DataFactory;

export async function scheduleDownloadAttachment(submission, remoteFile) {
  const remoteDataId = uuid();
  const remoteDataUri = cts.BASE_TABLE.remoteDataObject.concat(remoteDataId);
  const nowSparql = rst.termToString(
    literal(new Date(), 'http://www.w3.org/2001/XMLSchema#dateTime')
  );

  // We need to attach a cloned version of the authentication data, because,
  // download-url service needs this information to perform its actions.
  //
  // We could consider not attaching this information to the remoteData URI,
  // but after the automatic-submission task reached its final statem the
  // credentials are removed (out of security considerations) If by then,
  // download-url hasn't finished successfuly its task, it won't be able to do
  // so anymore
  //
  // Note: probably some clean up background job might be needed. Needs perhaps
  // a bit of better thinking
  const newAuthConf = await attachClonedAuthenticationConfiguraton(
    remoteDataUri,
    submission
  );

  try {
    const queryString = `
      ${cts.SPARQL_PREFIXES}
      INSERT {
        GRAPH ?filesGraph {
          ${rst.termToString(namedNode(remoteDataUri))}
            a nfo:RemoteDataObject ,
              nfo:FileDataObject ;
            rpioHttp:requestHeader
              <http://data.lblod.info/request-headers/29b14d06-e584-45d6-828a-ce1f0c018a8e> ;
            mu:uuid ${rst.termToString(literal(remoteDataId))} ;
            nie:url ${rst.termToString(namedNode(remoteFile))} ;
            dct:creator
              <http://lblod.data.gift/services/import-submission-service> ;
            adms:status
              <http://lblod.data.gift/file-download-statuses/ready-to-be-cached> ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} .

        }
        GRAPH ?submissionGraph {
          ${rst.termToString(namedNode(submission))}
            nie:hasPart ${rst.termToString(namedNode(remoteDataUri))}.
        }
      }
      WHERE {
        GRAPH ?submissionGraph {
          ${rst.termToString(namedNode(submission))}
            nie:hasPart ?remoteDataObject.
        }
        GRAPH ?filesGraph {
          ?remoteDataObject a ?type.
        }
      }`;
    await update(queryString);
    return remoteDataUri;
  } catch (e) {
    console.error('Something went wrong during the storage of submission');
    console.error(e);
    console.info('Cleaning credentials');
    if (newAuthConf.newAuthConf) {
      await cleanCredentials(newAuthConf.newAuthConf);
    }
    throw e;
  }
}
