import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import jsdom from 'jsdom';
import { analyse } from '@lblod/marawa/rdfa-context-scanner';
import flatten from 'lodash.flatten';
import uniqWith from 'lodash.uniqwith';

class RdfaExtractor {
  constructor(html) {
    this.html = html;
  }

  rdfa() {
    const dom = new jsdom.JSDOM(this.html);
    const domNode =  dom.window.document.querySelector('body');

    const blocks = analyse(domNode);
    const triples = flatten(blocks.map(b => b.context)).map(t => new Triple(t));
    return uniqWith(triples, (a, b) => a.isEqual(b));
  }

  ttl() {
    return this.rdfa().map(t => t.toNT()).join('\n');
  }
}

class Triple {
  constructor({ subject, predicate, object, datatype }) {
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.datatype = datatype;
  }

  isEqual(other) {
    return this.subject == other.subject
      && this.predicate == other.predicate
      && this.object == other.object
      && this.datatype == other.datatype;
  }

  toNT() {
    const predicate = this.predicate == 'a' ? this.predicate : sparqlEscapeUri(this.predicate);
    let obj;
    if (this.datatype == 'http://www.w3.org/2000/01/rdf-schema#Resource') {
      obj = sparqlEscapeUri(this.object);
    } else {
      obj = `""${sparqlEscapeString(this.object)}""`;
      if (this.datatype)
        obj += `^^${sparqlEscapeUri(this.datatype)}`;
    }

    return `${sparqlEscapeUri(this.subject)} ${predicate} ${obj} .`;
  }
}

export default RdfaExtractor;
