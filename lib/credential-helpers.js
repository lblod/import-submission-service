import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { v4 as uuid } from 'uuid';
import { BASIC_AUTH, OAUTH2 } from '../env';
import * as rst from 'rdf-string-ttl';
import * as cts from '../automatic-submission-flow-tools/constants';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

export async function getAuthenticationConfigForSubmission(submissionUri) {
  const getInfoQuery = `
    ${cts.SPARQL_PREFIXES}
    SELECT DISTINCT ?authenticationConfiguration WHERE {
      ${rst.termToString(namedNode(submissionUri))}
        dgftSec:targetAuthenticationConfiguration ?authenticationConfiguration .
    }
  `;

  return parseResult(await query(getInfoQuery))[0];
}

export async function cleanCredentials(authenticationConfigurationUri) {
  const cleanQuery = `
    ${cts.SPARQL_PREFIXES}
    DELETE {
      GRAPH ?g {
        ?srcSecrets
          ?secretsP ?secretsO.
      }
    }
    WHERE {
      GRAPH ?g {
        ${rst.termToString(namedNode(authenticationConfigurationUri))}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets
          ?secretsP ?secretsO.
      }
    }`;
  await update(cleanQuery);
}

export async function attachClonedAuthenticationConfiguraton(
  remoteDataObjectUri,
  submissionUri
) {
  const getInfoQuery = `
    ${cts.SPARQL_PREFIXES}
    SELECT DISTINCT ?graph ?remoteObjectGraph ?secType ?authenticationConfiguration WHERE {
      GRAPH ?graph {
        ${rst.termToString(namedNode(submissionUri))}
          dgftSec:targetAuthenticationConfiguration
            ?authenticationConfiguration .
        ?authenticationConfiguration
          dgftSec:securityConfiguration/rdf:type ?secType .
        ${rst.termToString(namedNode(submissionUri))}
          nie:hasPart ?remoteDataObject.
      }
      GRAPH ?remoteObjectGraph {
        ?remoteDataObject a ?type .
      }
    }`;

  const authData = parseResult(await query(getInfoQuery))[0];
  const newAuthConf = `http://data.lblod.info/authentications/${uuid()}`;
  const newConf = `http://data.lblod.info/configurations/${uuid()}`;
  const newCreds = `http://data.lblod.info/credentials/${uuid()}`;

  let cloneQuery = '';

  if (!authData) {
    return null;
  } else if (authData.secType === BASIC_AUTH) {
    cloneQuery = `
      ${cts.SPARQL_PREFIXES}
      INSERT {
        GRAPH ${rst.termToString(namedNode(authData.remoteObjectGraph))} {
          ${rst.termToString(namedNode(remoteDataObjectUri))}
            dgftSec:targetAuthenticationConfiguration
              ${rst.termToString(namedNode(newAuthConf))} .
        }
        GRAPH ${rst.termToString(namedNode(authData.graph))} {
          ${rst.termToString(namedNode(newAuthConf))}
            dgftSec:secrets ${rst.termToString(namedNode(newCreds))} .
          ${rst.termToString(namedNode(newCreds))}
            meb:username ?user ;
            muAccount:password ?pass .
          ${rst.termToString(namedNode(newAuthConf))}
            dgftSec:securityConfiguration
              ${rst.termToString(namedNode(newConf))} .
          ${rst.termToString(namedNode(newConf))}
            ?srcConfP ?srcConfO.
        }
      }
      WHERE {
        ${rst.termToString(namedNode(authData.authenticationConfiguration))}
          dgftSec:securityConfiguration ?srcConfg.
        ?srcConfg
          ?srcConfP ?srcConfO.
        ${rst.termToString(namedNode(authData.authenticationConfiguration))}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets 
          meb:username ?user ;
          muAccount:password ?pass .
     }`;
  } else if (authData.secType == OAUTH2) {
    cloneQuery = `
      ${cts.SPARQL_PREFIXES}
      INSERT {
        GRAPH ${rst.termToString(namedNode(authData.remoteObjectGraph))} {
          ${rst.termToString(namedNode(remoteDataObjectUri))}
            dgftSec:targetAuthenticationConfiguration
              ${rst.termToString(namedNode(newAuthConf))} .
        }
        GRAPH ${rst.termToString(namedNode(authData.graph))} {
          ${rst.termToString(namedNode(newAuthConf))}
            dgftSec:secrets ${rst.termToString(namedNode(newCreds))} .
          ${rst.termToString(namedNode(newCreds))}
            dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
          ${rst.termToString(namedNode(newAuthConf))}
            dgftSec:securityConfiguration
              ${rst.termToString(namedNode(newConf))} .
          ${rst.termToString(namedNode(newConf))}
            ?srcConfP ?srcConfO.
        }
      }
      WHERE {
        ${rst.termToString(namedNode(authData.authenticationConfiguration))}
          dgftSec:securityConfiguration ?srcConfg.
        ?srcConfg
          ?srcConfP ?srcConfO.
        ${rst.termToString(namedNode(authData.authenticationConfiguration))}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets
          dgftOauth:clientId ?clientId ;
          dgftOauth:clientSecret ?clientSecret .
     }
   `;
  } else {
    throw `Unsupported Security type ${authData.secType}`;
  }
  await update(cloneQuery);
  return { newAuthConf, newConf, newCreds };
}

/**
 * convert results of select query to an array of objects.
 * courtesy: Niels Vandekeybus & Felix
 * @method parseResult
 * @return {Array}
 */
export function parseResult(result) {
  if (!(result.results && result.results.bindings.length)) return [];

  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    bindingKeys.forEach((key) => {
      if (
        row[key] &&
        row[key].datatype == 'http://www.w3.org/2001/XMLSchema#integer' &&
        row[key].value
      ) {
        obj[key] = parseInt(row[key].value);
      } else if (
        row[key] &&
        row[key].datatype == 'http://www.w3.org/2001/XMLSchema#dateTime' &&
        row[key].value
      ) {
        obj[key] = new Date(row[key].value);
      } else obj[key] = row[key] ? row[key].value : undefined;
    });
    return obj;
  });
}
