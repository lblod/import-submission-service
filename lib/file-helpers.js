import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';
import { sparqlEscapeDateTime, sparqlEscapeInt, sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import * as env from '../constants.js';

export async function loadFileData(fileUri){
  console.log(`Getting contents of file ${fileUri}`);
  const path = fileUri.replace('share://', '/share/');
  const content = await fs.readFile(path, 'utf-8');
  return content;
}

/**
 * Write the given TTL content to a file and relates it to the given remote file and submitted document
 *
 * @param string ttl Turtle to write to the file
 * @param string submittedDocument URI of the submittedDocument to relate the new TTL file to
 * @param string remoteFile URI of the remote file to relate the new TTL file to
*/
export async function writeTtlFile(content, submittedDocument, remoteFile, reqState) {
  const physicalId = uuid();
  const logicalId = uuid();
  const filename = `${physicalId}.ttl`;
  const path = `/share/submissions/${filename}`;
  const physicalUri = path.replace('/share/', 'share://');
  const logicalUri = env.PREFIX_TABLE.asj.concat(logicalId);
  const nowSparql = sparqlEscapeDateTime(new Date());

  try {
    await fs.writeFile(path, content, 'utf-8');
  } catch (e) {
    console.log(`Failed to write TTL to file <${path}>.`);
    throw e;
  }

  try {
    const stats = await fs.stat(path);
    const fileSize = stats.size;

    await update(`
      ${env.PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(reqState.submissionGraph)} {
          ${sparqlEscapeUri(physicalUri)}
            a nfo:FileDataObject;
            nie:dataSource asj:${logicalId} ;
            nie:dataSource ?localFile ;
            mu:uuid ${sparqlEscapeString(physicalId)};
            dct:type <http://data.lblod.gift/concepts/harvested-data> ;
            nfo:fileName ${sparqlEscapeString(filename)} ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            dct:format "text/turtle" ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} ;
            dbpedia:fileExtension "ttl" .

          asj:${logicalId}
            a nfo:FileDataObject;
            mu:uuid ${sparqlEscapeString(logicalId)} ;
            dct:type <http://data.lblod.gift/concepts/harvested-data> ;
            nfo:fileName ${sparqlEscapeString(filename)} ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            dct:format "text/turtle" ;
            nfo:fileSize ${sparqlEscapeInt(fileSize)} ;
            dbpedia:fileExtension "ttl" .
            
          ${sparqlEscapeUri(submittedDocument)} dct:source ${sparqlEscapeUri(physicalUri)} .
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(reqState.submissionGraph)} {
          ${sparqlEscapeUri(remoteFile)} a nfo:FileDataObject .
          ?localFile nie:dataSource ${sparqlEscapeUri(remoteFile)}.
        }
      }`);

  } catch (e) {
    console.log(`Failed to write TTL resource <${physicalUri}> to triplestore.`);
    throw e;
  }
  return { physicalUri, logicalUri };
}
