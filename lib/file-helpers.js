import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import fs from 'fs';

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
    return fs.readFileSync(path);
  } else {
    return null;
  }
};

export {
  getFileContent
}
