import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeInt, uuid } from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';

const PREFIXES = `
  PREFIX dct:   <http://purl.org/dc/terms/>
  PREFIX melding:   <http://lblod.data.gift/vocabularies/automatische-melding/>
  PREFIX adms:  <http://www.w3.org/ns/adms#>
  PREFIX nie:   <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
  PREFIX nfo:   <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX rpioHttp: <http://redpencil.data.gift/vocabularies/http/>
`;

export async function scheduleDownloadAttachment(submission, remoteFile){
  const remoteDataId = uuid();
  const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;
  const timestamp = new Date();

  const queryString = `
    ${PREFIXES}
    INSERT {
      GRAPH ?filesGraph {
       ${sparqlEscapeUri(remoteDataUri)} a nfo:RemoteDataObject, nfo:FileDataObject;
         rpioHttp:requestHeader <http://data.lblod.info/request-headers/accept/text/html>;
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
      GRAPH ?filesGraph {
        ?harvestedHtmlFile nie:dataSource ?remoteDataObject .
      }
      GRAPH ?submissionGraph {
        ${sparqlEscapeUri(submission)} nie:hasPart ?remoteDataObject.
      }
    }
  `;

  await update(queryString);
  return remoteDataUri;

}
