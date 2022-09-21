export function isCentraalBestuurVanEredienstDocument(
  submittedDocument,
  triples
) {
  const list = [
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/18833df2-8c9e-4edd-87fd-b5c252337349',
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461',
    'https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e',
  ];

  const documentTypes = triples
    .filter(
      (t) =>
        t.subject == submittedDocument &&
        (t.predicate == 'a' ||
          t.predicate == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
    )
    .map((t) => t.object);

  const match = documentTypes.find((docType) => list.includes(docType));
  return !!match;
}
