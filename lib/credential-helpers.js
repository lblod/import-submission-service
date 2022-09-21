import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, uuid } from 'mu';
import { BASIC_AUTH, OAUTH2, PREFIXES } from '../env.js';

export async function getAuthenticationConfigForSubmission(submissionUri) {
  const getInfoQuery = `
    ${PREFIXES}
    SELECT DISTINCT ?authenticationConfiguration WHERE {
      ${sparqlEscapeUri(submissionUri)}
        dgftSec:targetAuthenticationConfiguration ?authenticationConfiguration.
    }
  `;

  return parseResult(await query(getInfoQuery))[0];
}

export async function cleanCredentials(authenticationConfigurationUri) {
  const cleanQuery = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ?srcSecrets
          ?secretsP ?secretsO.
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(authenticationConfigurationUri)}
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
    ${PREFIXES}
    SELECT DISTINCT ?graph ?remoteObjectGraph ?secType ?authenticationConfiguration WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(submissionUri)}
          dgftSec:targetAuthenticationConfiguration ?authenticationConfiguration.
        ?authenticationConfiguration
          dgftSec:securityConfiguration/rdf:type ?secType .
        ${sparqlEscapeUri(submissionUri)}
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
      ${PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(authData.remoteObjectGraph)} {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
        }
        GRAPH ${sparqlEscapeUri(authData.graph)} {
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)}
            meb:username ?user ;
            muAccount:password ?pass .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)}.
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO.
        }
      }
      WHERE {
        ${sparqlEscapeUri(authData.authenticationConfiguration)}
          dgftSec:securityConfiguration ?srcConfg.
        ?srcConfg
          ?srcConfP ?srcConfO.
        ${sparqlEscapeUri(authData.authenticationConfiguration)}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets 
          meb:username ?user ;
          muAccount:password ?pass .
     }`;
  } else if (authData.secType == OAUTH2) {
    cloneQuery = `
      ${PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(authData.remoteObjectGraph)} {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
        }
        GRAPH ${sparqlEscapeUri(authData.graph)} {
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)}
            dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)}.
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO.
        }
      }
      WHERE {
        ${sparqlEscapeUri(authData.authenticationConfiguration)}
          dgftSec:securityConfiguration ?srcConfg.
        ?srcConfg
          ?srcConfP ?srcConfO.
        ${sparqlEscapeUri(authData.authenticationConfiguration)}
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
