import * as mas from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants';
import * as rst from 'rdf-string-ttl';
import * as sjp from 'sparqljson-parse';
import * as N3 from 'n3';
import { v4 as uuid } from 'uuid';
const { namedNode, literal } = N3.DataFactory;

/**
 * Enrich the harvested triples dataset with derived knowledge based on the
 * current harvested triples and the data in the triplestore.
 */
export async function enrichSubmission(
  submittedDocument,
  file,
  remoteDataObject,
  store,
  documentUrl
) {
  //The store is not functional unfortunately, so pass the reference to functions that modify it.
  await expandSkosTree(store);
  await addSubmissionUrl(
    store,
    submittedDocument,
    file,
    remoteDataObject,
    documentUrl
  );
  await addClassifications(store);
  if (await isVGC(store)) await expandDecisionToMeetingPath(store);
  //Also don't have to return the store, not functional
}

/**
 * Similar to enrich, but separate call, because data is collected async.
 */
export async function enrichWithAttachmentInfo(
  store,
  submittedDocument,
  attachmentRemoteDataObject,
  url
) {
  const beginSize = store.size;
  translateRemoteUrlToSourceTriples(
    store,
    submittedDocument,
    attachmentRemoteDataObject,
    url
  );
  console.log(
    `Enrich submission with ${
      store.size - beginSize
    } triples by adding the URL field for an attachment`
  );
}

/**
 * Enrich the harvested data with the broader document types by explicitly
 * adding each broader type as a triple to the harvested triples dataset.
 *
 * E.g. a 'Belastingsreglement' is also a 'Reglement and verordening'
 */
async function expandSkosTree(store) {
  const beginSize = store.size;
  const matches = store.getQuads(
    undefined,
    namedNode(`${cts.PREFIX_TABLE.rdf}type`),
    undefined
  );

  for (const match of matches) {
    const response = await mas.querySudo(`
      ${cts.SPARQL_PREFIXES}
        SELECT DISTINCT ?parent
        WHERE {
          GRAPH <http://mu.semte.ch/graphs/public> {
            ${rst.termToString(match.object)}
              a skos:Concept, rdfs:Class ;
              skos:broader+ ?parent .
            ?parent a rdfs:Class .
          }
        }
    `);
    const sparqlJsonParser = new sjp.SparqlJsonParser();
    const parsedResults = sparqlJsonParser.parseJsonResults(response);
    parsedResults.forEach((binding) =>
      store.addQuad(
        match.subject,
        namedNode(`${cts.PREFIX_TABLE.rdf}type`),
        binding.parent
      )
    );
  }
  console.log(
    `Enrich submission with ${
      store.size - beginSize
    } triples by expanding SKOS tree.`
  );
}

/**
 * Enrich the harvested data with the submitted publication URL such that the
 * URL field in the form is automatically filled in.
 *
 * Note: the remoteFile is already persisted in the store by the
 * automatic-submission service. We just need to enrich the harvested triples
 * dataset that will be written to a TTL file.
 */
async function addSubmissionUrl(
  store,
  submittedDocument,
  file,
  remoteDataObject,
  documentUrl
) {
  const beginSize = store.size;
  await translateRemoteUrlToSourceTriples(
    store,
    submittedDocument,
    remoteDataObject,
    documentUrl
  );
  store.addQuad(
    file,
    namedNode(`${cts.PREFIX_TABLE.nie}dataSource`),
    remoteDataObject
  );
  console.log(
    `Enrich submission with ${
      store.size - beginSize
    } triples by adding the URL field.`
  );
}

function translateRemoteUrlToSourceTriples(
  store,
  submittedDocument,
  remoteDataObject,
  documentUrl
) {
  store.addQuad(
    submittedDocument,
    namedNode(`${cts.PREFIX_TABLE.dct}hasPart`),
    remoteDataObject
  );
  store.addQuad(
    remoteDataObject,
    namedNode(`${cts.PREFIX_TABLE.nie}url`),
    literal(documentUrl.value)
  );
  store.addQuad(
    remoteDataObject,
    namedNode(`${cts.PREFIX_TABLE.rdf}type`),
    namedNode(`${cts.PREFIX_TABLE.nfo}RemoteDataObject`)
  );
}

/**
 * Enrich the harvested data with the classifications of the bestuursorgaan and
 * the bestuurseenheid.
 */
async function addClassifications(store) {
  const beginSize = store.size;
  const bestuursorgaan = store.getObjects(
    undefined,
    namedNode('http://data.vlaanderen.be/ns/mandaat#isTijdspecialisatieVan'),
    undefined
  )[0];

  if (bestuursorgaan) {
    const response = await mas.querySudo(`
      PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

      SELECT ?bestuursorgaanClassification ?bestuurseenheid ?bestuurseenheidClassification WHERE {
        GRAPH ?g {
          ${rst.termToString(bestuursorgaan)}
            besluit:classificatie ?bestuursorgaanClassification ;
            besluit:bestuurt ?bestuurseenheid .
          ?bestuurseenheid
            besluit:classificatie ?bestuurseenheidClassification .
        }
      } LIMIT 1
    `);

    const sparqlJsonParser = new sjp.SparqlJsonParser();
    const parsedResults = sparqlJsonParser.parseJsonResults(response);
    if (parsedResults.length) {
      store.addQuad(
        bestuursorgaan,
        namedNode(`${cts.PREFIX_TABLE.besluit}bestuurt`),
        parsedResults[0].bestuurseenheid
      );
      store.addQuad(
        bestuursorgaan,
        namedNode(`${cts.PREFIX_TABLE.besluit}classificatie`),
        parsedResults[0].bestuursorgaanClassification
      );
      store.addQuad(
        parsedResults[0].bestuurseenheid,
        namedNode(`${cts.PREFIX_TABLE.besluit}classificatie`),
        parsedResults[0].bestuurseenheidClassification
      );
    }
  }
  console.log(
    `Enrich submission with ${
      store.size - beginSize
    } triples by adding the orgaan and eenheid classifications.`
  );
}

/**
 * Expand the path leading to the meeting date for VGC - they use an adapted
 * model in their submissions.
 */
async function expandDecisionToMeetingPath(store) {
  const beginSize = store.size;
  const decisions = store.getSubjects(
    undefined,
    namedNode(`${cts.PREFIX_TABLE.besluit}Besluit`)
  );

  decisions.forEach((decision) => {
    const uuidBehandelingVanAgendapunt = uuid();
    const behandelingVanAgendapunt = namedNode(
      `http://data.lblod.info/id/behandelingen-van-agendapunt/${uuidBehandelingVanAgendapunt}`
    );
    const uuidAgendapunt = uuid();
    const agendapunt = namedNode(
      `http://data.lblod.info/id/agendapunten/${uuidAgendapunt}`
    );
    const meeting = store.getSubjects(
      undefined,
      namedNode(`${cts.PREFIX_TABLE.besluit}Zitting`)
    )[0];
    store.addQuad(
      behandelingVanAgendapunt,
      namedNode(`${cts.PREFIX_TABLE.prov}generated`),
      decision
    );
    store.addQuad(
      behandelingVanAgendapunt,
      namedNode(`${cts.PREFIX_TABLE.rdf}type`),
      namedNode(`${cts.PREFIX_TABLE.besluit}BehandelingVanAgendapunt`)
    );
    store.addQuad(
      behandelingVanAgendapunt,
      namedNode(`${cts.PREFIX_TABLE.mu}uuid`),
      literal(uuidBehandelingVanAgendapunt)
    );
    store.addQuad(
      behandelingVanAgendapunt,
      namedNode(`${cts.PREFIX_TABLE.dct}subject`),
      agendapunt
    );
    store.addQuad(
      agendapunt,
      namedNode(`${cts.PREFIX_TABLE.rdf}type`),
      namedNode(`${cts.PREFIX_TABLE.besluit}BehandelingVanAgendapunt`)
    );
    store.addQuad(
      agendapunt,
      namedNode(`${cts.PREFIX_TABLE.mu}uuid`),
      literal(uuidAgendapunt)
    );
    store.addQuad(
      meeting,
      namedNode(`${cts.PREFIX_TABLE.besluit}behandelt`),
      agendapunt
    );
  });
  console.log(
    `Enrich submission with ${
      store.size - beginSize
    } triples by expanding the path to the meeting's date.`
  );
}

async function isVGC(store) {
  const bestuursorgaan = store.getObjects(
    undefined,
    namedNode(`${cts.PREFIX_TABLE.eli}passed_by`)
  )[0];
  if (!bestuursorgaan) {
    return false;
  } else {
    const vgcClassification = namedNode(
      'http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/d90c511e-f827-488c-84ba-432c8f69561c'
    );
    const response = await mas.querySudo(`
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      ASK {
        GRAPH <http://mu.semte.ch/graphs/public> {
          ${rst.termToString(bestuursorgaan)}
            <http://data.vlaanderen.be/ns/mandaat#isTijdspecialisatieVan> ?orgaan .
          ?orgaan
            <http://data.vlaanderen.be/ns/besluit#bestuurt> ?eenheid .
          ?eenheid
            <http://data.vlaanderen.be/ns/besluit#classificatie>
              ${rst.termToString(vgcClassification)} .
        }
      }`);
    const sparqlJsonParser = new sjp.SparqlJsonParser();
    const parsedResults = sparqlJsonParser.parseJsonBoolean(response);
    return parsedResults;
  }
}
