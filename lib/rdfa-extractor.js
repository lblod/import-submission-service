import { RdfaParser } from 'rdfa-streaming-parser';
import * as N3 from 'n3';

export async function extractRdfa(htmlStream, documentUrl) {
  const parser = new RdfaParser({ baseIRI: documentUrl.value });
  const data = await new Promise((resolve, reject) => {
    const allData = [];
    htmlStream
      .pipe(parser)
      .on('data', (data) => {
        allData.push(data);
      })
      .on('error', reject)
      .on('end', () => {
        resolve(allData);
      });
  });
  const store = new N3.Store();
  store.addQuads(data);
  return store;
}
