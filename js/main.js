// Menu no celular
const burger = document.querySelector('.burger');
const menu = document.getElementById('menu');
burger.addEventListener('click', () => {
  const aberto = menu.classList.toggle('aberto');
  burger.setAttribute('aria-expanded', aberto);
});

// Ano no rodapé
document.getElementById('ano').textContent = new Date().getFullYear();

// Texto que se escreve sozinho (só na página inicial)
const alvo = document.getElementById('digita');
if (alvo && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const frases = [
    'Estudante de Ciência da Computação',
    'IA generativa e engenharia de prompt',
    'Automação de processos',
    'Dados e bancos relacionais'
  ];
  let f = 0, c = 0, apagando = false;
  const passo = () => {
    const frase = frases[f];
    c += apagando ? -1 : 1;
    alvo.textContent = frase.slice(0, c);
    let espera = apagando ? 35 : 70;
    if (!apagando && c === frase.length) { apagando = true; espera = 1600; }
    else if (apagando && c === 0) { apagando = false; f = (f + 1) % frases.length; espera = 400; }
    setTimeout(passo, espera);
  };
  setTimeout(passo, 1800);
}

// Filtro de projetos
document.querySelectorAll('.filtros button').forEach(botao => {
  botao.addEventListener('click', () => {
    const filtro = botao.dataset.filtro;
    document.querySelectorAll('.filtros button').forEach(b => b.setAttribute('aria-pressed', b === botao));
    document.querySelectorAll('.projeto').forEach(p => {
      p.hidden = filtro !== 'todos' && !p.dataset.cat.split(' ').includes(filtro);
    });
  });
});

// E-mail montado só no clique sem estar visível no HTML (para evitar spam)
const email = document.getElementById('email');
if (email) {
  email.addEventListener('click', e => {
    e.preventDefault();
    location.href = 'mailto:' + email.dataset.u + '@' + email.dataset.d;
  });
}

// Troca de foto: real <-> cartoon (clique, toque ou Enter/Espaço)
const troca = document.getElementById('troca');
if (troca) {
  const dica = troca.querySelector('.dica');
  troca.addEventListener('click', () => {
    const cartoon = troca.getAttribute('aria-pressed') !== 'true';
    troca.setAttribute('aria-pressed', cartoon);
    dica.textContent = cartoon ? 'Ver foto real' : 'Ver versão cartoon';
  });
}

// Fluido que acompanha o mouse (código em js/fluido.js)
{
  const s = document.createElement('script');
  s.src = document.currentScript.src.replace('main.js', 'fluido.js');
  document.head.appendChild(s);
}