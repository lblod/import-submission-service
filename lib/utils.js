import * as cts from '../automatic-submission-flow-tools/constants';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

export function isCentraalBestuurVanEredienstDocument(
  store,
  submittedDocument
) {
  const list = [
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/18833df2-8c9e-4edd-87fd-b5c252337349',
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461',
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e',
  ];

  return store.some(
    (q) => list.includes(q.object.value),
    submittedDocument,
    namedNode(`${cts.PREFIX_TABLE.rdf}type`)
  );
}
