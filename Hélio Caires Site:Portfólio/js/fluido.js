// Efeito Fumaça Cursor do mouse 
(() => {
  if (!matchMedia('(hover: hover)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // AJUSTES: 
  const PALETA = ['#38d5ff', '#8b7bff', '#ff5fa2', '#3de8b0']; // cores da tinta, em ordem
  const VELOCIDADE_COR = 0.12;  // quão rápido a cor muda enquanto você move o mouse
  const INTENSIDADE = 0.15;     // quanta tinta cada movimento deposita (0.08 sutil, 0.3 forte)
  const OPACIDADE = 0.40;       // opacidade máxima da fumaça (1 = totalmente sólida)
  const DURACAO = 2;          // quão rápido a tinta some (menor = fica mais tempo)
  const RAIO = 0.10;            // espessura do rastro
  const FORCA = 6000;           // força com que o mouse empurra o fluido
  const TURBILHAO = 25;         // quantidade de redemoinhos
  const RES_SIMULACAO = 128;    // resolução da física (maior = mais detalhe e mais pesado)
  const RES_COR = 640;          // resolução da tinta
  const TEMPO_OCIOSO = 8000;    // ms parado até a animação pausar para poupar bateria
  
  const canvas = document.createElement('canvas');
  canvas.className = 'efeito-fluido';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false
  });
  if (!gl) return;
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return;

  let vel, cor, div, curl, pres;
  let pSplat, pAdv, pDiv, pCurl, pVort, pPres, pGrad, pClear, pDisplay;

  try {
    const compila = (tipo, fonte) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, fonte);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };

    const VS = compila(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`);

    const CAB = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`;

    const programa = (fonte) => {
      const p = gl.createProgram();
      gl.attachShader(p, VS);
      gl.attachShader(p, compila(gl.FRAGMENT_SHADER, CAB + fonte));
      gl.bindAttribLocation(p, 0, 'aPosition');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const nome = gl.getActiveUniform(p, i).name;
        u[nome] = gl.getUniformLocation(p, nome);
      }
      return { p, u };
    };

    pSplat = programa(`
uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main() {
  vec2 d = vUv - point; d.x *= aspectRatio;
  vec3 splat = exp(-dot(d, d) / radius) * color;
  o = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
}`);
    pAdv = programa(`
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform float dt; uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  o = texture(uSource, coord) / (1.0 + dissipation * dt);
}`);
    pDiv = programa(`
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x; float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y; float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`);
    pCurl = programa(`
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y; float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x; float B = texture(uVelocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`);
    pVort = programa(`
uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main() {
  float L = texture(uCurl, vL).x; float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x; float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C; force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + force * dt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`);
    pPres = programa(`
uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
  float d = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`);
    pGrad = programa(`
uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`);
    pClear = programa(`
uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }`);
    // a tinta vira transparência: o fundo do site continua visível onde não há fumaça
    // Mantém a cor viva: só a quantidade de tinta vira opacidade (a cor não estoura para branco).
    pDisplay = programa(`
uniform sampler2D uTexture; uniform float opacidade;
void main() {
  vec3 c = max(texture(uTexture, vUv).rgb, 0.0);
  float m = max(c.r, max(c.g, c.b));
  float k = (1.0 - exp(-m * 2.4)) * opacidade;
  vec3 matiz = m > 0.0001 ? c / m : vec3(0.0);
  o = vec4(matiz * k, k);
}`);

    // quadrado que cobre a tela inteira
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
  } catch (erro) {
    return; // sem efeito, mas o site continua normal
  }

  const criaFBO = (w, h, interno, formato, filtro) => {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, interno, w, h, 0, formato, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex, fbo, w, h, tx: 1 / w, ty: 1 / h,
      attach(unidade) {
        gl.activeTexture(gl.TEXTURE0 + unidade);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        return unidade;
      }
    };
  };
  // par de texturas: lê de uma, escreve na outra e troca
  const duplo = (w, h, interno, formato, filtro) => {
    let a = criaFBO(w, h, interno, formato, filtro);
    let b = criaFBO(w, h, interno, formato, filtro);
    return {
      tx: a.tx, ty: a.ty,
      get ler() { return a; },
      get escrever() { return b; },
      troca() { const t = a; a = b; b = t; }
    };
  };

  const resolucao = (r) => {
    let a = innerWidth / innerHeight;
    if (a < 1) a = 1 / a;
    const menor = Math.round(r), maior = Math.round(r * a);
    return innerWidth > innerHeight ? { w: maior, h: menor } : { w: menor, h: maior };
  };

  const iniciaFBOs = () => {
    const s = resolucao(RES_SIMULACAO), d = resolucao(RES_COR);
    vel = duplo(s.w, s.h, gl.RG16F, gl.RG, gl.LINEAR);
    cor = duplo(d.w, d.h, gl.RGBA16F, gl.RGBA, gl.LINEAR);
    div = criaFBO(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
    curl = criaFBO(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
    pres = duplo(s.w, s.h, gl.R16F, gl.RED, gl.NEAREST);
  };
  const ajustaTela = () => { canvas.width = innerWidth; canvas.height = innerHeight; };

  try {
    ajustaTela();
    iniciaFBOs();
  } catch (erro) {
    return;
  }
  document.body.prepend(canvas);

  const usa = (pr) => { gl.useProgram(pr.p); return pr.u; };
  const desenha = (alvo) => {
    if (alvo) { gl.viewport(0, 0, alvo.w, alvo.h); gl.bindFramebuffer(gl.FRAMEBUFFER, alvo.fbo); }
    else { gl.viewport(0, 0, canvas.width, canvas.height); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const raio = () => {
    let r = RAIO / 100;
    const a = canvas.width / canvas.height;
    return a > 1 ? r * a : r;
  };

  const mancha = (x, y, dx, dy, c) => {
    let u = usa(pSplat);
    gl.uniform1f(u.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(u.point, x, y);
    gl.uniform1f(u.radius, raio());
    gl.uniform1i(u.uTarget, vel.ler.attach(0));
    gl.uniform3f(u.color, dx, dy, 0);
    desenha(vel.escrever); vel.troca();
    gl.uniform1i(u.uTarget, cor.ler.attach(0));
    gl.uniform3f(u.color, c[0], c[1], c[2]);
    desenha(cor.escrever); cor.troca();
  };

  const passo = (dt) => {
    gl.disable(gl.BLEND);
    let u = usa(pCurl);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, vel.ler.attach(0));
    desenha(curl);

    u = usa(pVort);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, vel.ler.attach(0));
    gl.uniform1i(u.uCurl, curl.attach(1));
    gl.uniform1f(u.curl, TURBILHAO);
    gl.uniform1f(u.dt, dt);
    desenha(vel.escrever); vel.troca();

    u = usa(pDiv);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, vel.ler.attach(0));
    desenha(div);

    u = usa(pClear);
    gl.uniform1i(u.uTexture, pres.ler.attach(0));
    gl.uniform1f(u.value, 0.8);
    desenha(pres.escrever); pres.troca();

    u = usa(pPres);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uDivergence, div.attach(0));
    for (let i = 0; i < 20; i++) {
      gl.uniform1i(u.uPressure, pres.ler.attach(1));
      desenha(pres.escrever); pres.troca();
    }

    u = usa(pGrad);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uPressure, pres.ler.attach(0));
    gl.uniform1i(u.uVelocity, vel.ler.attach(1));
    desenha(vel.escrever); vel.troca();

    u = usa(pAdv);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, vel.ler.attach(0));
    gl.uniform1i(u.uSource, vel.ler.attach(0));
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, 0.2);
    desenha(vel.escrever); vel.troca();

    gl.uniform1i(u.uVelocity, vel.ler.attach(0));
    gl.uniform1i(u.uSource, cor.ler.attach(1));
    gl.uniform1f(u.dissipation, DURACAO);
    desenha(cor.escrever); cor.troca();
  };

  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const CORES = PALETA.map(hex);
  // mistura suave entre as cores da paleta conforme o tempo passa
  const corAtual = (t) => {
    const n = CORES.length;
    const p = (t * VELOCIDADE_COR) % n;
    const i = Math.floor(p);
    let f = p - i; f = f * f * (3 - 2 * f);
    const a = CORES[i], b = CORES[(i + 1) % n];
    return a.map((v, k) => (v + (b[k] - v) * f) * INTENSIDADE);
  };

  let pendente = null, px = null, py = null;
  let parado = 0, rodando = false, anterior = 0;

  const quadro = (agora) => {
    const dt = Math.min((agora - anterior) / 1000, 1 / 60) || 1 / 60;
    anterior = agora;
    if (pendente) {
      // limita saltos grandes (queda de fps) e deposita menos tinta quando o mouse anda devagar
      const dx = Math.max(-0.08, Math.min(0.08, pendente.dx));
      const dy = Math.max(-0.08, Math.min(0.08, pendente.dy));
      const quanto = Math.min(1, 0.2 + Math.hypot(dx, dy) * 60);
      mancha(pendente.x, pendente.y, dx * FORCA, dy * FORCA, corAtual(agora / 1000).map(v => v * quanto));
      pendente = null;
    }
    passo(dt);
    usa(pDisplay);
    gl.uniform1f(pDisplay.u.opacidade, OPACIDADE);
    gl.uniform1i(pDisplay.u.uTexture, cor.ler.attach(0));
    desenha(null);
    // conta o tempo parado pela própria simulação (assim vale também em computadores lentos)
    parado += dt * 1000;
    if (parado < TEMPO_OCIOSO) requestAnimationFrame(quadro);
    else rodando = false;
  };
  const acorda = () => {
    if (rodando) return;
    rodando = true;
    anterior = performance.now();
    requestAnimationFrame(quadro);
  };

  addEventListener('pointermove', (e) => {
    const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
    if (px !== null) {
      let dx = x - px, dy = y - py;
      const a = canvas.width / canvas.height;
      if (a < 1) dx *= a; else dy /= a;
      if (dx || dy) {
        // junta vários movimentos num só desenho por quadro
        if (pendente) { pendente.x = x; pendente.y = y; pendente.dx += dx; pendente.dy += dy; }
        else pendente = { x, y, dx, dy };
      }
    }
    px = x; py = y;
    parado = 0;
    acorda();
  }, { passive: true });
  document.addEventListener('mouseleave', () => { px = py = null; });

  let atraso;
  addEventListener('resize', () => {
    clearTimeout(atraso);
    atraso = setTimeout(() => {
      try { ajustaTela(); iniciaFBOs(); } catch (erro) { canvas.remove(); }
    }, 150);
  });
})();
