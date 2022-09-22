import * as mu from 'mu';
import * as mas from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants.js';
import * as fil from '../automatic-submission-flow-tools/asfFiles.js';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

/**
 * Write the given TTL content to a file and relates it to the given remote file and submitted document
 *
 * @param string ttl Turtle to write to the file
 * @param string submittedDocument URI of the submittedDocument to relate the new TTL file to
 * @param string remoteFile URI of the remote file to relate the new TTL file to
 */
export async function store(content, submittedDocumentUri, graphUri) {
  const filesData = await fil.createFromContent(
    content,
    namedNode(submittedDocumentUri),
    namedNode(graphUri)
  );
  //TODO is this still necessary?
  await mas.updateSudo(`
    ${cts.SPARQL_PREFIXES}
    INSERT DATA {
      GRAPH ${mu.sparqlEscapeUri(graphUri)} {
        ${mu.sparqlEscapeUri(submittedDocumentUri)}
          dct:source ${mu.sparqlEscapeUri(filesData.logicalFile.value)} .
      }
    }`);
  return filesData.logicalFile.value;
}
