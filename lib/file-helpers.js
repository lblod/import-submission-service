import * as mas from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants';
import * as fil from '../automatic-submission-flow-tools/asfFiles';
import * as rst from 'rdf-string-ttl';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

/**
 * Write the given TTL content to a file and relates it to the given remote
 * file and submitted document
 *
 * @param string ttl Turtle to write to the file
 * @param string submittedDocument URI of the submittedDocument to relate the
 * new TTL file to
 * @param string remoteFile URI of the remote file to relate the new TTL file
 * to
 */
export async function storeContent(
  content,
  submittedDocument,
  remoteFile,
  graph
) {
  const filesData = await fil.createFromContent(
    content,
    submittedDocument,
    namedNode(cts.SERVICES.importSubmision),
    graph
  );
  await mas.updateSudo(`
    ${cts.SPARQL_PREFIXES}
    INSERT {
      GRAPH ${rst.termToString(graph)} {
        ${rst.termToString(submittedDocument)}
          dct:source ${rst.termToString(filesData.physicalFile)} .
        ${rst.termToString(filesData.logicalFile)}
          dct:type <http://data.lblod.gift/concepts/harvested-data> .
        ${rst.termToString(filesData.physicalFile)}
          dct:type <http://data.lblod.gift/concepts/harvested-data> ;
          nie:dataSource ?localFile .
      }
    }
    WHERE {
      GRAPH ${rst.termToString(graph)} {
        ${rst.termToString(remoteFile)} a nfo:FileDataObject .
        ?localFile nie:dataSource ${rst.termToString(remoteFile)}.
      }
    }`);
  return filesData;
}

export async function storeStore(
  store,
  submittedDocument,
  remoteDataObject,
  graph
) {
  const writer = new N3.Writer({ format: 'text/turtle' });
  store.forEach((quad) => writer.addQuad(quad));
  const content = await new Promise((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  return storeContent(content, submittedDocument, remoteDataObject, graph);
}
