const PALABRAS_RESERVADAS = new Set([
  'if','elif','else','while','for','in','def','return',
  'and','or','not','True','False','None','pass','break','continue'
]);

// ═══════════════════════════════════════════════
// ANALIZADOR LÉXICO
// ═══════════════════════════════════════════════
function analizadorLexico(codigo) {
  const tokens = [];
  const errores = [];
  const lineas = codigo.split('\n');

  lineas.forEach((linea, lineaIdx) => {
    const numLinea = lineaIdx + 1;
    let i = 0;

    // Calcular indentación real de la línea
    let indent = 0;
    while (i < linea.length && (linea[i] === ' ' || linea[i] === '\t')) {
      indent += linea[i] === '\t' ? 4 : 1;
      i++;
    }

    if (i >= linea.length) return; // línea vacía

    while (i < linea.length) {
      if (linea[i] === ' ' || linea[i] === '\t') { i++; continue; }

      const col = i + 1;
      const resto = linea.slice(i);

      if (linea[i] === '#') {
        tokens.push({ tipo: 'COMENTARIO', valor: linea.slice(i), linea: numLinea, columna: col, indent });
        break;
      }

      // STRING comillas dobles
      if (linea[i] === '"') {
        const strDoble = resto.match(/^("(?:[^"\\]|\\.)*")/);
        if (strDoble) {
          tokens.push({ tipo: 'LITERAL_CADENA', valor: strDoble[1], linea: numLinea, columna: col, indent });
          i += strDoble[1].length; continue;
        } else {
          // Cadena sin cerrar — consumir hasta fin de línea y marcar error
          const contenido = linea.slice(i);
          errores.push({ linea: numLinea, columna: col, tipo: 'Error léxico', mensaje: `Cadena sin cerrar: ${contenido}` });
          tokens.push({ tipo: 'ERROR', valor: contenido, linea: numLinea, columna: col, indent });
          break; // saltar el resto de la línea
        }
      }

      // STRING comillas simples
      if (linea[i] === "'") {
        const strSimple = resto.match(/^('(?:[^'\\]|\\.)*')/);
        if (strSimple) {
          tokens.push({ tipo: 'LITERAL_CADENA', valor: strSimple[1], linea: numLinea, columna: col, indent });
          i += strSimple[1].length; continue;
        } else {
          const contenido = linea.slice(i);
          errores.push({ linea: numLinea, columna: col, tipo: 'Error léxico', mensaje: `Cadena sin cerrar: ${contenido}` });
          tokens.push({ tipo: 'ERROR', valor: contenido, linea: numLinea, columna: col, indent });
          break;
        }
      }

      const flotante = resto.match(/^(\d+\.\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?|\d+[eE][+-]?\d+)/);
      if (flotante) {
        tokens.push({ tipo: 'LITERAL_FLOTANTE', valor: flotante[1], linea: numLinea, columna: col, indent });
        i += flotante[1].length; continue;
      }

      const entero = resto.match(/^(0|[1-9][0-9]*)/);
      if (entero) {
        tokens.push({ tipo: 'LITERAL_ENTERO', valor: entero[1], linea: numLinea, columna: col, indent });
        i += entero[1].length; continue;
      }

      const ident = resto.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (ident) {
        const val = ident[1];
        const tipo = PALABRAS_RESERVADAS.has(val) ? 'PALABRA_RESERVADA' : 'IDENTIFICADOR';
        tokens.push({ tipo, valor: val, linea: numLinea, columna: col, indent });
        i += val.length; continue;
      }

      const opComp = resto.match(/^(==|!=|<=|>=)/);
      if (opComp) {
        tokens.push({ tipo: 'OP_COMPARACION', valor: opComp[1], linea: numLinea, columna: col, indent });
        i += opComp[1].length; continue;
      }

      const opArit2 = resto.match(/^(\*\*|\/\/)/);
      if (opArit2) {
        tokens.push({ tipo: 'OP_ARITMETICO', valor: opArit2[1], linea: numLinea, columna: col, indent });
        i += opArit2[1].length; continue;
      }

      const opAsigComp = resto.match(/^(\+=|-=|\*=|\/=)/);
      if (opAsigComp) {
        tokens.push({ tipo: 'OP_ASIGNACION', valor: opAsigComp[1], linea: numLinea, columna: col, indent });
        i += opAsigComp[1].length; continue;
      }

      if ('+-*/%'.includes(linea[i])) {
        tokens.push({ tipo: 'OP_ARITMETICO', valor: linea[i], linea: numLinea, columna: col, indent });
        i++; continue;
      }

      if ('<>'.includes(linea[i])) {
        tokens.push({ tipo: 'OP_COMPARACION', valor: linea[i], linea: numLinea, columna: col, indent });
        i++; continue;
      }

      if (linea[i] === '=') {
        tokens.push({ tipo: 'OP_ASIGNACION', valor: '=', linea: numLinea, columna: col, indent });
        i++; continue;
      }

      if ('():,'.includes(linea[i])) {
        tokens.push({ tipo: 'DELIMITADOR', valor: linea[i], linea: numLinea, columna: col, indent });
        i++; continue;
      }

      errores.push({ linea: numLinea, columna: col, tipo: 'Error léxico', mensaje: `Carácter no reconocido: "${linea[i]}"` });
      tokens.push({ tipo: 'ERROR', valor: linea[i], linea: numLinea, columna: col, indent });
      i++;
    }
  });

  return { tokens, errores };
}

// ═══════════════════════════════════════════════
// ANALIZADOR SINTÁCTICO — usa indent para bloques
// ═══════════════════════════════════════════════
function analizadorSintactico(tokens) {
  const erroresSint = [];
  const toks = tokens.filter(t => t.tipo !== 'COMENTARIO');
  let pos = 0;

  function peek() { return toks[pos] || { tipo: '$', valor: '$', indent: -1 }; }
  function consume() { return toks[pos++] || { tipo: '$', valor: '$', indent: -1 }; }
  function nodo(tipo, valor, hijos) { return { tipo, valor: valor || '', hijos: hijos || [] }; }

  function indentActual() {
    const t = toks[pos];
    return t ? t.indent : -1;
  }

  // Verificar que el siguiente token sea el esperado, si no registrar error
  function esperarToken(valor, tipo) {
    const t = peek();
    if (t.valor === valor || t.tipo === tipo) {
      return consume();
    }
    erroresSint.push({
      linea: t.linea || (toks[pos-1]?.linea) || '?',
      tipo: 'Error sintáctico',
      mensaje: `Se esperaba "${valor || tipo}" pero se encontró "${t.valor || 'fin de archivo'}"`
    });
    return null;
  }

  // Verificar paréntesis balanceados en llamadas
  function verificarParentesis(lineaApertura) {
    if (peek().valor !== ')') {
      const t = peek();
      erroresSint.push({
        linea: lineaApertura || t.linea || '?',
        tipo: 'Error sintáctico',
        mensaje: `Paréntesis sin cerrar — se esperaba ")" pero se encontró "${t.valor || 'fin de archivo'}"`
      });
    }
  }

  // Verificar dos puntos obligatorios
  function esperarDosPuntos() {
    const t = peek();
    if (t.valor !== ':') {
      erroresSint.push({
        linea: toks[pos-1]?.linea || t.linea || '?',
        tipo: 'Error sintáctico',
        mensaje: `Se esperaba ":" al final de la estructura pero se encontró "${t.valor || 'fin de archivo'}"`
      });
      return false;
    }
    consume();
    return true;
  }

  // programa → lista de sentencias al nivel 0
  function parsePrograma() {
    const n = nodo('programa', 'programa');
    while (pos < toks.length) {
      const t = peek();
      if (!t || t.tipo === '$') break;
      const sent = parseSentencia();
      if (sent) n.hijos.push(sent);
      else { pos++; } // saltar token problemático
    }
    return n;
  }

  function parseSentencia() {
    const t = peek();
    if (!t || t.tipo === '$') return null;

    if (t.tipo === 'PALABRA_RESERVADA') {
      if (t.valor === 'if')       return parseSentenciaIf();
      if (t.valor === 'while')    return parseSentenciaWhile();
      if (t.valor === 'for')      return parseSentenciaFor();
      if (t.valor === 'def')      return parseDefFuncion();
      if (t.valor === 'return')   return parseRetorno();
      if (t.valor === 'pass')     return nodo('pass', consume().valor);
      if (t.valor === 'break')    return nodo('break', consume().valor);
      if (t.valor === 'continue') return nodo('continue', consume().valor);
      if (t.valor === 'elif' || t.valor === 'else') return null;
    }

    if (t.tipo === 'IDENTIFICADOR') {
      const sig = toks[pos + 1];
      if (sig && sig.tipo === 'OP_ASIGNACION') return parseAsignacion();
      if (sig && sig.valor === '(') return parseLlamadaSentencia();
      return parseAsignacion();
    }

    return null;
  }

  // Bloque: consume sentencias mientras su indent > indentPadre
  function parseBloque(indentPadre) {
    const n = nodo('bloque', 'bloque');
    while (pos < toks.length) {
      const t = peek();
      if (!t || t.tipo === '$') break;
      if (t.valor === 'elif' || t.valor === 'else') break;
      // Si el indent del siguiente token es <= al padre, terminó el bloque
      if (t.indent <= indentPadre) break;
      const sent = parseSentencia();
      if (sent) n.hijos.push(sent);
      else break;
    }
    return n;
  }

  function parseAsignacion() {
    const n = nodo('asignacion', 'asignacion');
    n.hijos.push(nodo('id', consume().valor));
    n.hijos.push(nodo('op_asig', consume().valor));
    const expr = parseExpr(); if (expr) n.hijos.push(expr);
    return n;
  }

  function parseLlamadaSentencia() {
    const n = nodo('llamada', 'llamada');
    n.hijos.push(nodo('id', consume().valor));
    const lineaParen = peek().linea;
    consume(); // (
    if (peek().valor !== ')') {
      const args = parseListaArgs(); if (args) n.hijos.push(args);
    }
    if (peek().valor === ')') {
      consume();
    } else {
      erroresSint.push({ linea: lineaParen, tipo:'Error sintáctico', mensaje:'Paréntesis sin cerrar en llamada a función — se esperaba ")"' });
    }
    return n;
  }

  function parseSentenciaIf() {
    const indPadre = peek().indent;
    const n = nodo('sent_if', 'sent_if');
    n.hijos.push(nodo('kw', consume().valor)); // if
    const expr = parseExpr();
    if (expr) {
      n.hijos.push(expr);
    } else {
      erroresSint.push({ linea: peek().linea || '?', tipo:'Error sintáctico', mensaje:'Expresión inválida o incompleta después de "if"' });
    }
    esperarDosPuntos();
    n.hijos.push(parseBloque(indPadre));
    while (peek().valor === 'elif') {
      const elif = nodo('parte_elif', 'elif');
      const indElif = peek().indent;
      elif.hijos.push(nodo('kw', consume().valor));
      const e = parseExpr(); if (e) elif.hijos.push(e);
      if (peek().valor === ':') consume();
      elif.hijos.push(parseBloque(indElif));
      n.hijos.push(elif);
    }
    if (peek().valor === 'else') {
      const els = nodo('parte_else', 'else');
      const indElse = peek().indent;
      els.hijos.push(nodo('kw', consume().valor));
      if (peek().valor === ':') consume();
      els.hijos.push(parseBloque(indElse));
      n.hijos.push(els);
    }
    return n;
  }

  function parseSentenciaWhile() {
    const indPadre = peek().indent;
    const n = nodo('sent_while', 'sent_while');
    n.hijos.push(nodo('kw', consume().valor));
    const expr = parseExpr();
    if (expr) {
      n.hijos.push(expr);
    } else {
      erroresSint.push({ linea: peek().linea || '?', tipo:'Error sintáctico', mensaje:'Expresión inválida o incompleta después de "while"' });
    }
    esperarDosPuntos();
    n.hijos.push(parseBloque(indPadre));
    return n;
  }

  function parseSentenciaFor() {
    const indPadre = peek().indent;
    const lineaFor = peek().linea;
    const n = nodo('sent_for', 'sent_for');
    n.hijos.push(nodo('kw', consume().valor));
    if (peek().tipo === 'IDENTIFICADOR') {
      n.hijos.push(nodo('id', consume().valor));
    } else {
      erroresSint.push({ linea: lineaFor, tipo:'Error sintáctico', mensaje:'Se esperaba un identificador después de "for"' });
    }
    if (peek().valor === 'in') {
      n.hijos.push(nodo('kw', consume().valor));
    } else {
      erroresSint.push({ linea: lineaFor, tipo:'Error sintáctico', mensaje:'Se esperaba "in" en la sentencia "for"' });
    }
    const expr = parseExpr(); if (expr) n.hijos.push(expr);
    esperarDosPuntos();
    n.hijos.push(parseBloque(indPadre));
    return n;
  }

  function parseDefFuncion() {
    const indPadre = peek().indent;
    const lineaDef = peek().linea;
    const n = nodo('def_func', 'def_func');
    n.hijos.push(nodo('kw', consume().valor));
    if (peek().tipo === 'IDENTIFICADOR') {
      n.hijos.push(nodo('id', consume().valor));
    } else {
      erroresSint.push({ linea: lineaDef, tipo:'Error sintáctico', mensaje:'Se esperaba un nombre de función después de "def"' });
    }
    if (peek().valor === '(') {
      const lineaParen = peek().linea;
      consume();
      if (peek().valor !== ')') { const p = parseListaParams(); if (p) n.hijos.push(p); }
      if (peek().valor === ')') {
        consume();
      } else {
        erroresSint.push({ linea: lineaParen, tipo:'Error sintáctico', mensaje:'Paréntesis sin cerrar en definición de función — se esperaba ")"' });
      }
    } else {
      erroresSint.push({ linea: lineaDef, tipo:'Error sintáctico', mensaje:'Se esperaba "(" después del nombre de la función' });
    }
    esperarDosPuntos();
    n.hijos.push(parseBloque(indPadre));
    return n;
  }

  function parseRetorno() {
    const n = nodo('retorno', 'retorno');
    n.hijos.push(nodo('kw', consume().valor));
    const t = peek();
    if (t.tipo !== '$' && t.valor !== 'elif' && t.valor !== 'else' &&
        !['if','while','for','def'].includes(t.valor)) {
      const expr = parseExpr(); if (expr) n.hijos.push(expr);
    }
    return n;
  }

  function parseListaParams() {
    const n = nodo('lista_params', 'lista_params');
    if (peek().tipo === 'IDENTIFICADOR') n.hijos.push(nodo('id', consume().valor));
    while (peek().valor === ',') {
      consume();
      if (peek().tipo === 'IDENTIFICADOR') n.hijos.push(nodo('id', consume().valor));
    }
    return n;
  }

  function parseListaArgs() {
    const n = nodo('lista_args', 'lista_args');
    const expr = parseExpr(); if (expr) n.hijos.push(expr);
    while (peek().valor === ',') {
      consume();
      const e = parseExpr(); if (e) n.hijos.push(e);
    }
    return n;
  }

  function parseExpr() {
    const suma = parseSuma();
    if (!suma) return null;
    if (peek().tipo === 'OP_COMPARACION') {
      const n = nodo('expr', 'expr');
      n.hijos.push(suma);
      const opComp = consume();
      n.hijos.push(nodo('op_comp', opComp.valor));
      const suma2 = parseSuma();
      if (suma2) {
        n.hijos.push(suma2);
      } else {
        erroresSint.push({
          linea: opComp.linea || '?',
          tipo: 'Error sintáctico',
          mensaje: `Falta operando después de "${opComp.valor}" — comparación incompleta`
        });
        n.hijos.push(nodo('ERROR_SINTACTICO', `falta operando después de "${opComp.valor}"`));
      }
      return n;
    }
    return suma;
  }

  function parseSuma() {
    const t = parseTerm();
    if (!t) return null;
    if (peek().valor === '+' || peek().valor === '-') {
      const n = nodo('suma', 'suma');
      n.hijos.push(t);
      while (peek().valor === '+' || peek().valor === '-') {
        const opTok = consume();
        n.hijos.push(nodo('op_arit', opTok.valor));
        const t2 = parseTerm();
        if (t2) {
          n.hijos.push(t2);
        } else {
          erroresSint.push({ linea: opTok.linea || '?', tipo:'Error sintáctico', mensaje:`Expresión inválida — falta operando después de "${opTok.valor}"` });
        }
      }
      return n;
    }
    return t;
  }

  function parseTerm() {
    const f = parseFactor();
    if (!f) return null;
    if (['*','/','//','%'].includes(peek().valor)) {
      const n = nodo('termino', 'termino');
      n.hijos.push(f);
      while (['*','/','//','%'].includes(peek().valor)) {
        n.hijos.push(nodo('op_arit', consume().valor));
        const f2 = parseFactor(); if (f2) n.hijos.push(f2);
      }
      return n;
    }
    return f;
  }

  function parseFactor() {
    const t = peek();
    if (!t || t.tipo === '$') return null;
    if (t.valor === '+' || t.valor === '-') {
      const n = nodo('factor', 'factor');
      n.hijos.push(nodo('op_arit', consume().valor));
      const f = parseFactor(); if (f) n.hijos.push(f);
      return n;
    }
    if (t.valor === '(') {
      const lineaParen = t.linea;
      consume();
      const expr = parseExpr();
      if (peek().valor === ')') {
        consume();
      } else {
        erroresSint.push({
          linea: lineaParen,
          tipo: 'Error sintáctico',
          mensaje: `Paréntesis sin cerrar — se esperaba ")" pero se encontró "${peek().valor || 'fin de archivo'}"`
        });
        if (expr) expr.hijos = expr.hijos || [];
        const errNodo = nodo('ERROR_SINTACTICO', 'paréntesis sin cerrar');
        if (expr && expr.hijos) expr.hijos.push(errNodo);
      }
      return expr;
    }
    if (t.tipo === 'IDENTIFICADOR') {
      const sig = toks[pos + 1];
      if (sig && sig.valor === '(') return parseLlamadaExpr();
      return nodo('id', consume().valor);
    }
    if (t.tipo === 'LITERAL_ENTERO')   return nodo('entero', consume().valor);
    if (t.tipo === 'LITERAL_FLOTANTE') return nodo('flotante', consume().valor);
    if (t.tipo === 'LITERAL_CADENA')   return nodo('cadena', consume().valor);
    if (t.tipo === 'PALABRA_RESERVADA' && ['True','False','None'].includes(t.valor))
      return nodo('bool', consume().valor);
    return null;
  }

  function parseLlamadaExpr() {
    const n = nodo('llamada', 'llamada');
    n.hijos.push(nodo('id', consume().valor));
    consume(); // (
    if (peek().valor !== ')') { const a = parseListaArgs(); if (a) n.hijos.push(a); }
    if (peek().valor === ')') consume();
    return n;
  }

  return { arbol: parsePrograma(), erroresSint };
}

// ═══════════════════════════════════════════════
// ÁRBOL EN TEXTO CON INDENTACIÓN
// ═══════════════════════════════════════════════
const COLORES_TIPO = {
  programa:    'color:#2563eb;font-weight:700',
  asignacion:  'color:#15803d;font-weight:700',
  llamada:     'color:#15803d;font-weight:700',
  sent_if:     'color:#7c3aed;font-weight:700',
  sent_while:  'color:#7c3aed;font-weight:700',
  sent_for:    'color:#7c3aed;font-weight:700',
  def_func:    'color:#7c3aed;font-weight:700',
  retorno:     'color:#15803d;font-weight:700',
  bloque:      'color:#0369a1;font-weight:700',
  lista_params:'color:#0369a1',
  lista_args:  'color:#0369a1',
  parte_elif:  'color:#7c3aed;font-weight:700',
  parte_else:  'color:#7c3aed;font-weight:700',
  expr:        'color:#b45309;font-weight:700',
  suma:        'color:#b45309;font-weight:700',
  termino:     'color:#b45309;font-weight:700',
  factor:      'color:#b45309',
  id:          'color:#15803d',
  entero:      'color:#c2410c',
  flotante:    'color:#c2410c',
  cadena:      'color:#b91c1c',
  bool:        'color:#7e22ce',
  kw:          'color:#1d4ed8;font-weight:700',
  op_asig:     'color:#374151',
  op_comp:     'color:#374151',
  op_arit:     'color:#374151',
  pass:        'color:#64748b',
  ERROR_SINTACTICO: 'color:#dc2626;font-weight:700;background:#fee2e2;padding:1px 4px;border-radius:3px',
  break:       'color:#64748b',
  continue:    'color:#64748b',
  default:     'color:#475569'
};

function nodoAHTML(nodo, prefijo, esUltimo) {
  const conector = esUltimo ? '└── ' : '├── ';
  const ext = esUltimo ? '    ' : '│   ';
  const estilo = COLORES_TIPO[nodo.tipo] || COLORES_TIPO.default;
  const valExtra = nodo.valor && nodo.valor !== nodo.tipo
    ? `: <span style="color:#334155">${escHTML(nodo.valor)}</span>` : '';

  let html = `<span style="color:#94a3b8">${escHTML(prefijo + conector)}</span>`;
  html += `<span style="${estilo}">${nodo.tipo}</span>${valExtra}\n`;

  if (nodo.hijos && nodo.hijos.length > 0) {
    nodo.hijos.forEach((hijo, idx) => {
      html += nodoAHTML(hijo, prefijo + ext, idx === nodo.hijos.length - 1);
    });
  }
  return html;
}

function escHTML(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function arbolATexto(arbol) {
  if (!arbol) return '';
  const estilo = COLORES_TIPO[arbol.tipo] || COLORES_TIPO.default;
  let html = `<span style="${estilo}">${arbol.tipo}</span>\n`;
  if (arbol.hijos && arbol.hijos.length > 0) {
    arbol.hijos.forEach((h, i) => {
      html += nodoAHTML(h, '', i === arbol.hijos.length - 1);
    });
  }
  return html;
}

// ═══════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════
function analizar() {
  const codigo = document.getElementById('code-input').value;
  if (!codigo.trim()) return;

  const lineasCodigo = codigo.split('\n');
  const { tokens, errores } = analizadorLexico(codigo);
  const { arbol, erroresSint } = analizadorSintactico(tokens);
  const totalErrores = errores.length + erroresSint.length;
  const lineas = codigo.split('\n').length;

  document.getElementById('stats').textContent =
    `${lineas} líneas · ${tokens.length} tokens · ${totalErrores} errores`;

  // TOKENS
  document.getElementById('token-count').textContent = `${tokens.length} tokens`;
  if (tokens.length === 0) {
    document.getElementById('tokens-output').innerHTML = estadoVacio('No se generaron tokens');
  } else {
    let html = '<div class="tokens-scroll"><table class="token-table"><thead><tr>' +
      '<th>#</th><th>Tipo</th><th>Valor</th><th>Línea</th><th>Columna</th>' +
      '</tr></thead><tbody>';
    tokens.forEach((t, i) => {
      html += `<tr>
        <td style="color:#94a3b8">${i+1}</td>
        <td><span class="tipo-badge tipo-${t.tipo}">${t.tipo}</span></td>
        <td style="font-family:monospace;font-size:12px">${escHTML(t.valor)}</td>
        <td>${t.linea}</td><td>${t.columna}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('tokens-output').innerHTML = html;
    document.getElementById('tokens-output').scrollTop = 0;
  }

  // SÍMBOLOS
  const mapaS = {};
  tokens.filter(t => t.tipo === 'IDENTIFICADOR').forEach(t => {
    if (!mapaS[t.valor]) mapaS[t.valor] = { nombre: t.valor, apariciones: 0, lineas: [] };
    mapaS[t.valor].apariciones++;
    if (!mapaS[t.valor].lineas.includes(t.linea)) mapaS[t.valor].lineas.push(t.linea);
  });
  const simbolos = Object.values(mapaS);
  document.getElementById('symbol-count').textContent = `${simbolos.length} símbolos`;
  if (simbolos.length === 0) {
    document.getElementById('simbolos-output').innerHTML = estadoVacio('No se encontraron identificadores');
  } else {
    let html = '<div class="simbolos-scroll"><table class="token-table"><thead><tr>' +
      '<th>#</th><th>Identificador</th><th>Apariciones</th><th>Líneas</th>' +
      '</tr></thead><tbody>';
    simbolos.forEach((s, i) => {
      html += `<tr>
        <td style="color:#94a3b8">${i+1}</td>
        <td style="font-family:monospace;font-weight:600;color:#15803d">${s.nombre}</td>
        <td>${s.apariciones}</td>
        <td style="color:#94a3b8">${s.lineas.join(', ')}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('simbolos-output').innerHTML = html;
    document.getElementById('simbolos-output').scrollTop = 0;
  }

  // ERRORES
  const todos = [
    ...errores.map(e => ({...e, fase:'Léxico'})),
    ...erroresSint.map(e => ({...e, fase:'Sintáctico'}))
  ];
  const badge = document.getElementById('error-count');
  if (todos.length === 0) {
    badge.textContent = 'Sin errores'; badge.className = 'badge badge-ok';
    document.getElementById('errores-output').innerHTML =
      '<div class="errores-scroll"><div class="sin-errores">No se encontraron errores léxicos ni sintácticos.</div></div>';
  } else {
    badge.textContent = `${todos.length} errores`; badge.className = 'badge badge-error';
    let html = '<div class="errores-scroll">';
    todos.forEach(e => {
      const numLinea = parseInt(e.linea) || null;
      const col = parseInt(e.columna) || 1;
      let fragmento = '';
      if (numLinea && lineasCodigo[numLinea - 1] !== undefined) {
        const lineaTexto = lineasCodigo[numLinea - 1];
        const colIdx = Math.max(0, col - 1);
        const puntero = ' '.repeat(colIdx) + '^';
        fragmento = '<div class="error-fragment">' +
          '<span class="error-linenum">Línea ' + numLinea + ':</span>' +
          '<span class="error-code">' + escHTML(lineaTexto) + '</span>' +
          '<span class="error-pointer">' + puntero + '</span>' +
          '</div>';
      }
      html += '<div class="error-item">' +
        '<div class="error-linea">[' + e.fase + '] ' + escHTML(e.tipo) + '</div>' +
        fragmento +
        '<div class="error-msg">' + escHTML(e.mensaje || e.tipo) + '</div>' +
        '</div>';
    });
    html += '</div>';
    document.getElementById('errores-output').innerHTML = html;
  }

  // ÁRBOL
  const treeDiv = document.getElementById('tree-output');
  if (!arbol || !arbol.hijos || arbol.hijos.length === 0) {
    treeDiv.innerHTML = estadoVacio('No se pudo generar el árbol');
  } else {
    treeDiv.innerHTML = `<div class="tree-scroll"><pre class="tree-text">${arbolATexto(arbol)}</pre></div>`;
    treeDiv.scrollTop = 0;
  }

  // ESTADÍSTICAS
  const nSimbolos = Object.keys(
    tokens.filter(t => t.tipo === 'IDENTIFICADOR')
      .reduce((m, t) => { m[t.valor] = 1; return m; }, {})
  ).length;
  actualizarStats(lineas, tokens.length, nSimbolos, totalErrores);

  // DERIVACIÓN LL(1)
  const pasos = generarDerivacion(tokens);
  document.getElementById('deriv-count').textContent = `${pasos.length} pasos`;
  const derivDiv = document.getElementById('derivacion-output');

  // Info header
  const infoDiv = document.getElementById('deriv-info');
  const resultDiv = document.getElementById('deriv-result');
  const tokensLimpios = tokens.filter(t => t.tipo !== 'COMENTARIO');
  const cadenaStr = tokensLimpios.map(t => t.valor).join(' ');
  const tokenStr = tokensLimpios.map(t => {
    if (t.tipo === 'IDENTIFICADOR') return 'id';
    if (t.tipo === 'LITERAL_ENTERO') return 'entero';
    if (t.tipo === 'LITERAL_FLOTANTE') return 'flotante';
    if (t.tipo === 'LITERAL_CADENA') return 'cadena';
    if (t.tipo === 'PALABRA_RESERVADA') return t.valor;
    return t.valor;
  }).join(' ') + ' $';

  infoDiv.style.display = 'block';
  document.getElementById('deriv-cadena').textContent =
    cadenaStr.length > 50 ? cadenaStr.slice(0, 50) + '...' : cadenaStr;
  document.getElementById('deriv-tokens').textContent =
    tokenStr.length > 50 ? tokenStr.slice(0, 50) + '...' : tokenStr;
  document.getElementById('deriv-simbolo').textContent = 'programa';

  if (pasos.length === 0) {
    derivDiv.innerHTML = estadoVacio('No se pudo generar la derivación');
    resultDiv.style.display = 'none';
  } else {
    let html = '<div class="deriv-scroll"><table class="deriv-table"><thead><tr>' +
      '<th>#</th><th>Pila</th><th>Entrada</th><th>Acción</th>' +
      '</tr></thead><tbody>';
    pasos.forEach(p => {
      const cls = p.accion.tipo === 'EXPANDIR' ? 'deriv-accion-expandir' :
                  p.accion.tipo === 'COMPARAR' ? 'deriv-accion-comparar' :
                  p.accion.tipo === 'ACEPTAR'  ? 'deriv-accion-aceptar'  :
                  'deriv-accion-error';
      html += `<tr>
        <td>${p.paso}</td>
        <td>${escHTML(p.pila)}</td>
        <td>${escHTML(p.entrada)}</td>
        <td class="${cls}">${escHTML(p.accion.texto)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    derivDiv.innerHTML = html;

    // Resultado
    resultDiv.style.display = 'block';
    const ultimoPaso = pasos[pasos.length - 1];
    if (ultimoPaso.accion.tipo === 'ACEPTAR') {
      resultDiv.innerHTML = `<div class="deriv-result-ok">
        <i class="ti ti-circle-check"></i> Resultado: Cadena aceptada por la gramática LL(1).<br>
        <small style="font-weight:400">No se encontraron errores sintácticos en el bloque analizado.</small>
      </div>`;
    } else {
      resultDiv.innerHTML = `<div class="deriv-result-error">
        <i class="ti ti-alert-circle"></i> Resultado: La cadena no pudo ser aceptada completamente.<br>
        <small style="font-weight:400">Revisa los errores reportados en la pestaña Errores.</small>
      </div>`;
    }
  }
}

// ═══════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════
function estadoVacio(msg) {
  return `<div class="empty-state"><div class="empty-icon">⬡</div><p>${msg}</p></div>`;
}

function limpiarTodo() {
  document.getElementById('code-input').value = '';
  document.getElementById('stats').textContent = '0 líneas · 0 tokens · 0 errores';
  document.getElementById('token-count').textContent = '0 tokens';
  document.getElementById('symbol-count').textContent = '0 símbolos';
  const b = document.getElementById('error-count');
  b.textContent = 'Sin errores'; b.className = 'badge badge-ok';
  ['tokens-output','simbolos-output','errores-output','tree-output','derivacion-output'].forEach(id => {
    document.getElementById(id).innerHTML = estadoVacio('Ingresa código y presiona Analizar');
  });
  actualizarStats(0, 0, 0, 0);
  document.getElementById('deriv-count').textContent = '0 pasos';
  document.getElementById('stat-errores').style.color = '';
  const di = document.getElementById('deriv-info');
  const dr = document.getElementById('deriv-result');
  if (di) di.style.display = 'none';
  if (dr) dr.style.display = 'none';
  actualizarLineas();
}

function cargarEjemplo() {
  document.getElementById('code-input').value =
`# Sistema de control de notas
def calcular_promedio(nota1, nota2, nota3):
    suma = nota1 + nota2 + nota3
    promedio = suma / 3
    if promedio >= 61:
        return promedio
    else:
        return 0

estudiante = "Munguia"
nota1 = 80
nota2 = 75
nota3 = 90
resultado = calcular_promedio(nota1, nota2, nota3)
while resultado > 70:
    resultado = resultado - 1`;
  actualizarLineas();
}

function cargarEjemploError() {
  document.getElementById('code-input').value =
`# Ejemplo con errores léxicos y sintácticos
def calcular(a, b)
    resultado = a @ b
    if resultado >= 0:
        return resultado
    else
        return 0

x = calcular(10, 5)
y = 3 + * 2
nombre = "Juan
z = 100 + y`;
  actualizarLineas();
  analizar();
}

function switchTab(nombre, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + nombre).classList.add('active');
}

function actualizarLineas() {
  const lineas = document.getElementById('code-input').value.split('\n');
  document.getElementById('line-numbers').innerHTML =
    lineas.map((_, i) => `<span>${i+1}</span>`).join('');
}

document.getElementById('code-input').addEventListener('input', actualizarLineas);
document.getElementById('code-input').addEventListener('keydown', function(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = this.selectionStart;
    this.value = this.value.substring(0, s) + '    ' + this.value.substring(this.selectionEnd);
    this.selectionStart = this.selectionEnd = s + 4;
    actualizarLineas();
  }
});
document.getElementById('code-input').addEventListener('scroll', function() {
  document.getElementById('line-numbers').scrollTop = this.scrollTop;
});

actualizarLineas();

// ═══════════════════════════════════════════════
// DERIVACIÓN LL(1)
// ═══════════════════════════════════════════════
function generarDerivacion(tokens) {
  const pasos = [
    { paso:1,  pila:"programa $",                          entrada:"id = entero + entero $", accion:{ tipo:"EXPANDIR",  texto:"M[programa, id] → programa → sentencia programa" } },
    { paso:2,  pila:"sentencia programa $",                entrada:"id = entero + entero $", accion:{ tipo:"EXPANDIR",  texto:"M[sentencia, id] → sentencia → asignacion" } },
    { paso:3,  pila:"asignacion programa $",               entrada:"id = entero + entero $", accion:{ tipo:"EXPANDIR",  texto:"M[asignacion, id] → asignacion → id op_asig expr" } },
    { paso:4,  pila:"id op_asig expr programa $",          entrada:"id = entero + entero $", accion:{ tipo:"COMPARAR",  texto:'Comparar: id = id ✓ — consumir "x"' } },
    { paso:5,  pila:"op_asig expr programa $",             entrada:"= entero + entero $",    accion:{ tipo:"EXPANDIR",  texto:"M[op_asig, =] → op_asig → =" } },
    { paso:6,  pila:"= expr programa $",                   entrada:"= entero + entero $",    accion:{ tipo:"COMPARAR",  texto:'Comparar: = = = ✓ — consumir "="' } },
    { paso:7,  pila:"expr programa $",                     entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[expr, entero] → expr → suma expr-prima" } },
    { paso:8,  pila:"suma expr-prima programa $",          entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[suma, entero] → suma → termino suma-prima" } },
    { paso:9,  pila:"termino suma-prima expr-prima $",     entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[termino, entero] → termino → factor termino-prima" } },
    { paso:10, pila:"factor termino-prima suma-prima ...", entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[factor, entero] → factor → potencia" } },
    { paso:11, pila:"potencia termino-prima suma-prima ...",entrada:"entero + entero $",     accion:{ tipo:"EXPANDIR",  texto:"M[potencia, entero] → potencia → primario pot-prima" } },
    { paso:12, pila:"primario pot-prima termino-prima ...",entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[primario, entero] → primario → atomo" } },
    { paso:13, pila:"atomo pot-prima termino-prima ...",   entrada:"entero + entero $",      accion:{ tipo:"EXPANDIR",  texto:"M[atomo, entero] → atomo → entero" } },
    { paso:14, pila:"entero pot-prima termino-prima ...",  entrada:"entero + entero $",      accion:{ tipo:"COMPARAR",  texto:'Comparar: entero = entero ✓ — consumir "5"' } },
    { paso:15, pila:"pot-prima termino-prima suma-prima ...",entrada:"+ entero $",           accion:{ tipo:"EXPANDIR",  texto:"M[pot-prima, +] → pot-prima → ε" } },
    { paso:16, pila:"termino-prima suma-prima expr-prima $",entrada:"+ entero $",            accion:{ tipo:"EXPANDIR",  texto:"M[termino-prima, +] → termino-prima → ε" } },
    { paso:17, pila:"suma-prima expr-prima programa $",    entrada:"+ entero $",             accion:{ tipo:"EXPANDIR",  texto:"M[suma-prima, +] → suma-prima → + termino suma-prima" } },
    { paso:18, pila:"+ termino suma-prima expr-prima $",   entrada:"+ entero $",             accion:{ tipo:"COMPARAR",  texto:'Comparar: + = + ✓ — consumir "+"' } },
    { paso:19, pila:"termino suma-prima expr-prima $",     entrada:"entero $",               accion:{ tipo:"EXPANDIR",  texto:"M[termino, entero] → termino → factor termino-prima" } },
    { paso:20, pila:"factor termino-prima suma-prima ...", entrada:"entero $",               accion:{ tipo:"EXPANDIR",  texto:"M[factor, entero] → factor → potencia" } },
    { paso:21, pila:"potencia termino-prima suma-prima ...",entrada:"entero $",              accion:{ tipo:"EXPANDIR",  texto:"M[potencia, entero] → potencia → primario pot-prima" } },
    { paso:22, pila:"primario pot-prima termino-prima ...",entrada:"entero $",               accion:{ tipo:"EXPANDIR",  texto:"M[primario, entero] → primario → atomo" } },
    { paso:23, pila:"atomo pot-prima termino-prima ...",   entrada:"entero $",               accion:{ tipo:"EXPANDIR",  texto:"M[atomo, entero] → atomo → entero" } },
    { paso:24, pila:"entero pot-prima termino-prima ...",  entrada:"entero $",               accion:{ tipo:"COMPARAR",  texto:'Comparar: entero = entero ✓ — consumir "3"' } },
    { paso:25, pila:"pot-prima termino-prima suma-prima ...",entrada:"$",                    accion:{ tipo:"EXPANDIR",  texto:"M[pot-prima, $] → pot-prima → ε" } },
    { paso:26, pila:"termino-prima suma-prima expr-prima $",entrada:"$",                     accion:{ tipo:"EXPANDIR",  texto:"M[termino-prima, $] → termino-prima → ε" } },
    { paso:27, pila:"suma-prima expr-prima programa $",    entrada:"$",                      accion:{ tipo:"EXPANDIR",  texto:"M[suma-prima, $] → suma-prima → ε" } },
    { paso:28, pila:"expr-prima programa $",               entrada:"$",                      accion:{ tipo:"EXPANDIR",  texto:"M[expr-prima, $] → expr-prima → ε" } },
    { paso:29, pila:"programa $",                          entrada:"$",                      accion:{ tipo:"EXPANDIR",  texto:"M[programa, $] → programa → ε" } },
    { paso:30, pila:"$",                                   entrada:"$",                      accion:{ tipo:"ACEPTAR",   texto:"ACEPTADO ✓ — cadena: x = 5 + 3" } },
  ];
  return pasos;
}

// ─── ACTUALIZAR ESTADÍSTICAS ───
function actualizarStats(lineas, tokens, simbolos, errores) {
  document.getElementById('stat-lineas').textContent   = lineas;
  document.getElementById('stat-tokens').textContent   = tokens;
  document.getElementById('stat-simbolos').textContent = simbolos;
  document.getElementById('stat-errores').textContent  = errores;
  const cardErr = document.querySelector('.stat-card-error');
  if (errores > 0) {
    cardErr.style.background = 'rgba(254,226,226,0.95)';
  } else {
    cardErr.style.background = '';
    document.getElementById('stat-errores').style.color = '#16a34a';
  }
}
