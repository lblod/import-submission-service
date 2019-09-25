import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import jsdom from 'jsdom';
import { analyse } from '@lblod/marawa/rdfa-context-scanner';
import flatten from 'lodash.flatten';
import uniqWith from 'lodash.uniqwith';
import chunk from 'lodash.chunk';

const BATCH_SIZE = 5; // TODO SEAS seems to struggle with bigger batch sizes

/**
 * Imports the RDFa parsed from the HTML string in the specified graph.
 * Inserts are done in batches of BATCH_SIZE.
 *
 * @param string html RDFa/HTML string
 * @param string graph URI of the graph to import the data in
*/
async function importInGraph(html, graph) {
  const dom = toDomNode(html);
  const triples = getRdfa(dom);
  const statements = triples.map(t => toInsertStatement(t));
  const batches = chunk(statements, BATCH_SIZE);

  console.log(`Inserting harvested data in ${batches.length} batches of size ${BATCH_SIZE} in graph <${graph}>`);
  for (let batch of batches) {
    try {
      const q = `
      INSERT DATA {
        GRAPH <${graph}> {
          ${batch.join('\n')}
        }
      }
    `;
      await update(q);
    } catch (e) {
      console.log(`Failed to insert batch in graph <${graph}>.`);
      throw e;
    }
  }
}

function toInsertStatement(triple) {
  const predicate = triple.predicate == 'a' ? triple.predicate : sparqlEscapeUri(triple.predicate);
  let obj;
  if (triple.datatype == 'http://www.w3.org/2000/01/rdf-schema#Resource') {
    obj = sparqlEscapeUri(triple.object);
  } else {
    obj = `""${sparqlEscapeString(triple.object)}""`;
    if (triple.datatype)
      obj += `^^${sparqlEscapeUri(triple.datatype)}`;
  }

  return `${sparqlEscapeUri(triple.subject)} ${predicate} ${obj} .`;
}

function getRdfa(domNode) {
  function isEqual(a, b) {
    return a.subject == b.subject
      && a.predicate == b.predicate
      && a.object == b.object
      && a.datatype == b.datatype;
  }

  const blocks = analyse(domNode);
  const triples = uniqWith(flatten(blocks.map(b => b.context)), isEqual);
  return triples;
}

function toDomNode(html) {
  const dom = new jsdom.JSDOM(html);
  return dom.window.document.querySelector('body');
}

export {
  importInGraph
}
