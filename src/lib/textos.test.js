import { describe, expect, it } from 'vitest';
import { hashtagsACadena, textoPublicacion } from './textos.js';

describe('hashtagsACadena', () => {
  it('normaliza array y añade # donde falta', () => {
    expect(hashtagsACadena(['#branding', 'estudio'])).toBe('#branding #estudio');
  });

  it('acepta string separado por comas o espacios', () => {
    expect(hashtagsACadena('#a, b  #c')).toBe('#a #b #c');
  });

  it('elimina duplicados sin distinguir mayúsculas', () => {
    expect(hashtagsACadena(['#Branding', '#branding', 'branding'])).toBe('#Branding');
  });

  it('tolera vacío', () => {
    expect(hashtagsACadena(null)).toBe('');
    expect(hashtagsACadena([])).toBe('');
    expect(hashtagsACadena('  ,  ')).toBe('');
  });
});

describe('textoPublicacion', () => {
  it('une copy y hashtags con línea en blanco', () => {
    expect(textoPublicacion('Hola mundo', ['#a', 'b'])).toBe('Hola mundo\n\n#a #b');
  });

  it('sin hashtags devuelve solo el copy', () => {
    expect(textoPublicacion(' Hola ', null)).toBe('Hola');
  });

  it('sin copy devuelve solo hashtags', () => {
    expect(textoPublicacion('', ['#a'])).toBe('#a');
  });

  it('sin nada devuelve cadena vacía', () => {
    expect(textoPublicacion(null, null)).toBe('');
  });
});
