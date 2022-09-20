import {  updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeUri } from 'mu';
import * as env from '../constants.js';

export async function saveError({message, detail, reference}) {
  if (!message)
    throw 'Error needs a message describing what went wrong.';
  const id = uuid();
  const uri = `http://data.lblod.info/errors/${id}`;
  const q = `
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX oslc: <http://open-services.net/ns/core#>
    PREFIX dct:  <http://purl.org/dc/terms/>
    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>

    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/error> {
        ${sparqlEscapeUri(uri)}
          a oslc:Error ;
          mu:uuid ${sparqlEscapeString(id)} ;
          dct:subject ${sparqlEscapeString('Automatic Submission Service')} ;
          oslc:message ${sparqlEscapeString(message)} ;
          dct:created ${sparqlEscapeDateTime(new Date().toISOString())} ;
          ${reference ? `dct:references ${sparqlEscapeUri(reference)} ;` : ''}
          ${detail ? `oslc:largePreview ${sparqlEscapeString(detail)} ;` : ''}
          dct:creator ${sparqlEscapeUri(env.CREATOR)} .
      }
    }
   `;
  try {
    await update(q);
    return uri;
  }
  catch (e) {
    console.warn(`[WARN] Something went wrong while trying to store an error.\nMessage: ${e}\nQuery: ${q}`);
  }
}

export function isCentraalBestuurVanEredienstDocument(submittedDocument, triples) {
  const list = [
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/18833df2-8c9e-4edd-87fd-b5c252337349",
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461",
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e"
  ];

  const documentTypes = triples
        .filter(t => t.subject == submittedDocument
                && ( t.predicate == 'a' || t.predicate == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' ))
        .map(t => t.object);

  const match = documentTypes.find(docType => list.includes(docType));

  if(match) {
    return true;
  }
  else {
    return false;
  }
}
