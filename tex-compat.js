// Display-only compatibility. Original Markdown and original TeX are retained.
export function normalizeTex(tex){
  return tex.replace(/\\mathrmythm\b/g,'\\mathrm{thm')
    .replace(/\\left\s*\\llbracket\b/g,'\\left[\\!\\left[')
    .replace(/\\right\s*\\rrbracket\b/g,'\\right]\\!\\right]')
    .replace(/\\(bigl|Bigl|biggl|Biggl)\s*\\llbracket\b/g,(_,size)=>`\\${size}[\\!\\${size}[`)
    .replace(/\\(bigr|Bigr|biggr|Biggr)\s*\\rrbracket\b/g,(_,size)=>`\\${size}]\\!\\${size}]`)
    .replace(/\\\^\\ /g,'\\mathbin{\\text{\\^{}}}\\ ');
}
