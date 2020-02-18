import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import uniq from 'lodash.uniq';
import Triple from './triple';

export default async function enrich(submission, submittedDocument, remoteFile, triples) {
  let enrichments = [];

  if (triples && triples.length) {
    const expandedSkos = await expandSkosTree(triples);
    console.log(`Enrich submission with ${expandedSkos.length} triples by expanding SKOS tree.`);
    enrichments = enrichments.concat(expandedSkos);
  }

  const submissionUrlField = addSubmissionUrl(submittedDocument, remoteFile, triples);
  console.log(`Enrich submission with ${submissionUrlField.length} triples by adding the URL field.`);
  enrichments = enrichments.concat(submissionUrlField);

  return enrichments;
}

async function expandSkosTree(triples) {
  let enrichments = [];

  const typeTriples = triples.filter(t => t.predicate == 'a');

  if (typeTriples.length) {
    const q = `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT DISTINCT ?type ?parent WHERE {
      ?type a skos:Concept, rdfs:Class ;
            skos:broader+ ?parent .
      ?parent a rdfs:Class .

      VALUES ?type {
        ${typeTriples.map(t => sparqlEscapeUri(t.object)).join('\n')}
      }
    }
  `;
    const result = await query(q);

    result.results.bindings.forEach(binding => {
      const expandedTypes = typeTriples.filter(t => t.object == binding['type'].value).map(triple => {
        return new Triple({
          subject: triple.subject,
          predicate: 'a',
          object: binding['parent'].value,
          datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
        });
      });
      enrichments = enrichments.concat(expandedTypes);
    });
  }

  return enrichments;
}

function addSubmissionUrl(submittedDocument, remoteFile, triples) {
  // No need to write the remoteFile to the triplestore
  // since that's already done by the automatic-submission service
  return [
    new Triple({
      subject: submittedDocument,
      predicate: 'http://purl.org/dc/terms/hasPart',
      object: remoteFile,
      datatype: 'http://www.w3.org/2000/01/rdf-schema#Resource'
    })
  ];
}
