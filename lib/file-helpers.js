import * as mu from 'mu';
import * as mas from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants.js';
import * as fil from '../automatic-submission-flow-tools/asfFiles.js';
import * as N3 from 'n3';

/**
 * Write the given TTL content to a file and relates it to the given remote file and submitted document
 *
 * @param string ttl Turtle to write to the file
 * @param string submittedDocument URI of the submittedDocument to relate the new TTL file to
 * @param string remoteFile URI of the remote file to relate the new TTL file to
 */
export async function storeContent(content, submittedDocument, graph) {
  const filesData = await fil.createFromContent(
    content,
    submittedDocument,
    graph
  );
  //TODO is this still necessary?
  await mas.updateSudo(`
    ${cts.SPARQL_PREFIXES}
    INSERT DATA {
      GRAPH ${mu.sparqlEscapeUri(graph.value)} {
        ${mu.sparqlEscapeUri(submittedDocument.value)}
          dct:source ${mu.sparqlEscapeUri(filesData.logicalFile.value)} .
      }
    }`);
  return filesData.logicalFile;
}

export async function storeStore(store, submittedDocument, graph) {
  const writer = new N3.Writer({ format: 'text/turtle' });
  store.forEach((quad) => writer.addQuad(quad));
  const content = await new Promise((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  return storeContent(content, submittedDocument, graph);
}
