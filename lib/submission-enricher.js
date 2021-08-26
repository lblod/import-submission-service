import {sparqlEscapeUri} from 'mu';
import {querySudo as query} from '@lblod/mu-auth-sudo';
import { uniq } from 'lodash';
import Triple from './triple';

/**
 * Enrich the harvested triples dataset with derived knowledge
 * based on the current harvested triples and the data in the triplestore.
 */
export default async function enrich(submission, submittedDocument, remoteFile, triples) {
  let enrichments = [];

  if (triples && triples.length) {
    const expandedSkos = await expandSkosTree(triples);
    console.log(`Enrich submission with ${expandedSkos.length} triples by expanding SKOS tree.`);
    enrichments = enrichments.concat(expandedSkos);
  }

  const submissionUrlField = await addSubmissionUrl(submittedDocument, remoteFile, triples);
  console.log(`Enrich submission with ${submissionUrlField.length} triples by adding the URL field.`);
  enrichments = enrichments.concat(submissionUrlField);

  if (triples && triples.length) {
    const classificationFields = await addClassifications(triples);
    console.log(
        `Enrich submission with ${classificationFields.length} triples by adding the orgaan and eenheid classifications.`);
    enrichments = enrichments.concat(classificationFields);
  }
  return enrichments;
}

/**
 * Similar to enrich, but separate call, because data is collected async.
 */
export async function enrichWithAttachmentInfo(submittedDocument, attachmentRemoteDataObject, url) {
  const attachmentInfo = translateRemoteUrlToSourceTriples(submittedDocument, attachmentRemoteDataObject, url);
  console.log(`Enrich submission with ${attachmentInfo.length} triples by adding the URL field for an attachment`);
  return attachmentInfo;
}

/**
 * Enrich the harvested data with the broader document types
 * by explicitly adding each broader type as a triple to the harvested triples dataset.
 *
 * E.g. a 'Belastingsreglement' is also a 'Reglement and verordening'
 */
async function expandSkosTree(triples) {
  let enrichments = [];

  const types = uniq(triples.filter(t => t.predicate === 'a'));

  for (let type of types) {
    const result = await query(`
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        SELECT DISTINCT ?parent
        WHERE {
          GRAPH <http://mu.semte.ch/graphs/public> {
            ${sparqlEscapeUri(type.object)} a skos:Concept, rdfs:Class ;
                  skos:broader+ ?parent .
            ?parent a rdfs:Class .
          }
        }`
    );

    result.results.bindings.forEach(binding => {
      const parent = new Triple({
        subject: type.subject,
        predicate: 'a',
        object: binding['parent'].value,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      });
      enrichments.push(parent);
    });
  }
  return enrichments;
}

/**
 * Enrich the harvested data with the submitted publication URL
 * such that the URL field in the form is automatically filled in.
 *
 * Note: the remoteFile is already persisted in the store by the automatic-submission service.
 *       We just need to enrich the harvested triples dataset that will be written to a TTL file.
 */
async function addSubmissionUrl(submittedDocument, remoteFile, triples) {
  let enrichments = [];
  const result = await query(`
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?harvestedHtmlFile ?url WHERE {
      GRAPH ?g {
        ?harvestedHtmlFile nie:dataSource ${sparqlEscapeUri(remoteFile)} .
        ${sparqlEscapeUri(remoteFile)} nie:url ?url .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const harvestedFile = result.results.bindings[0]['harvestedHtmlFile'].value;
    const url = result.results.bindings[0]['url'].value;
    enrichments = translateRemoteUrlToSourceTriples(submittedDocument, remoteFile, url);
    enrichments.push(
      new Triple({
        subject: harvestedFile,
        predicate: 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#dataSource',
        object: remoteFile,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }));
  }

  return enrichments;
}

function translateRemoteUrlToSourceTriples(submittedDocument, remoteFile, url){
const triples = [
      new Triple({
        subject: submittedDocument,
        predicate: 'http://purl.org/dc/terms/hasPart',
        object: remoteFile,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }),
      new Triple({
        subject: remoteFile,
        predicate: 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url',
        object: url
      }),
      new Triple({
        subject: remoteFile,
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#RemoteDataObject',
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      })
  ];
  return triples;
}

/**
 * Enrich the harvested data with the classifications of the bestuursorgaan and the bestuurseenheid.
 */
async function addClassifications(triples) {
  let enrichments = [];
  const bestuursorgaan = triples.filter(t => t.predicate === 'http://data.vlaanderen.be/ns/mandaat#isTijdspecialisatieVan')[0].object;

  const result = await query(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT ?bestuursorgaanClassification ?bestuurseenheid ?bestuurseenheidClassification WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(bestuursorgaan)} besluit:classificatie ?bestuursorgaanClassification ;
          besluit:bestuurt ?bestuurseenheid .
        ?bestuurseenheid besluit:classificatie ?bestuurseenheidClassification .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const bestuursorgaanClassification = result.results.bindings[0]['bestuursorgaanClassification'].value;
    const bestuurseenheid = result.results.bindings[0]['bestuurseenheid'].value;
    const bestuurseenheidClassification = result.results.bindings[0]['bestuurseenheidClassification'].value;

    enrichments = enrichments.concat([
      new Triple({
        subject: bestuursorgaan,
        predicate: 'http://data.vlaanderen.be/ns/besluit#bestuurt',
        object: bestuurseenheid,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }),
      new Triple({
        subject: bestuursorgaan,
        predicate: 'http://data.vlaanderen.be/ns/besluit#classificatie',
        object: bestuursorgaanClassification,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      }),
      new Triple({
        subject: bestuurseenheid,
        predicate: 'http://data.vlaanderen.be/ns/besluit#classificatie',
        object: bestuurseenheidClassification,
        datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
      })
    ]);
  }

  return enrichments;
}
