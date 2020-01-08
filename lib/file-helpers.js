import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime, sparqlEscapeInt, uuid } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';

/**
 * Returns the content of the cached file for the given remote file
 *
 * @param string remoteFileUri URI of the remote file
*/
async function getFileContent(remoteFileUri) {
  const q = `
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?file
    WHERE {
      ?file nie:dataSource ${sparqlEscapeUri(remoteFileUri)} .
    } LIMIT 1
  `;

  const result = await query(q);
  if (result.results.bindings.length) {
    const file = result.results.bindings[0]['file'].value;
    console.log(`Getting contents of file ${file}`);
    const path = file.replace('share://', '/share/');
    const content = await fs.readFile(path);
    return content;
  } else {
    return null;
  }
};

/**
 * Write the given TTL content to a file and relates it to the given remote file
 *
 * @param string ttl Turtle to write to the file
 * @param string remoteFile URI of the remote file to relate the new TTL file to
*/
async function writeTtlFile(content, remoteFile) {
  const id = uuid();
  const filename = `${id}.ttl`;
  const path = `/share/submissions/${filename}`;
  const uri = path.replace('/share/', 'share://');
  const now = new Date();

  try {
    await fs.writeFile(path, content, 'utf-8');
  } catch (e) {
    console.log(`Failed to write TTL to file <${uri}>.`);
    throw e;
  }

  try {
    const stats = await fs.stat(path);
    const fileSize = stats.size;

    await update(`
      PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
      PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX dbpedia: <http://dbpedia.org/ontology/>

      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(uri)} a nfo:FileDataObject;
                                  nie:dataSource ?localFile ;
                                  mu:uuid ${sparqlEscapeString(id)};
                                  nfo:fileName ${sparqlEscapeString(filename)} ;
                                  dct:creator <http://lblod.data.gift/services/import-submission-service>;
                                  dct:created ${sparqlEscapeDateTime(now)};
                                  dct:modified ${sparqlEscapeDateTime(now)};
                                  dct:format "text/turtle";
                                  nfo:fileSize ${sparqlEscapeInt(fileSize)};
                                  dbpedia:fileExtension "ttl" .
        }
      } WHERE {
        GRAPH ?g {
          ?localFile nie:dataSource ${sparqlEscapeUri(remoteFile)} .
        }
      }
`);

  } catch (e) {
    console.log(`Failed to write TTL resource <${uri}> to triplestore.`);
    throw e;
  }

  return uri;
}

export {
  getFileContent,
  writeTtlFile
}
