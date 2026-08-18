# Painel DP

Hub central de ferramentas do Departamento Pessoal (GBEX / GBLOG). Uma única página estática que reúne o acesso às ferramentas que hoje vivem espalhadas em pastas separadas.

**No ar em:** https://painel-dp.netlify.app

## Como publicar uma mudança

O projeto está no GitHub (`Gbex-RH/PAINEL-DP`, branch `main`) conectado ao Netlify por deploy contínuo: todo push em `main` publica sozinho em cerca de 1 minuto, sem passo manual nenhum no Netlify.

```
git add -A
git commit -m "descreva a mudança"
git push
```

Repositório usa remote SSH (`git@github.com:Gbex-RH/PAINEL-DP.git`) — a autenticação HTTPS do Git ficava bloqueada pelo proxy corporativo da rede, então a chave SSH em `~/.ssh/id_ed25519` (cadastrada na conta GitHub `Gbex-RH`) é o que faz o push funcionar.

## Como abrir localmente

Dê duplo clique em `index.html`. Não precisa de servidor, build ou instalação — é HTML/CSS/JS puro. Útil pra testar uma mudança antes de publicar.

## Como adicionar uma nova ferramenta

Edite só o arquivo `assets/js/tools-data.js` e acrescente um objeto ao array `TOOLS`. Nenhum outro arquivo precisa mudar — categorias, filtros e contagem de ferramentas são gerados a partir desses dados.

Cada ferramenta tem um `status`:

- `"hosted"` — já tem uma URL fixa (ex.: hospedada no Netlify). Preencha `hosted.url` (e `hosted.authNote` se exigir login). O card ganha um link "Abrir" que leva direto pra URL, em nova aba.
- `"local"` — precisa ser iniciada manualmente na máquina (dev server, `.bat`, etc.), sem URL estável. Preencha `local.reason`, `local.steps` (passo a passo), `local.path`, `local.command` (ou `null` se for só abrir um arquivo) e `local.bestEffortUrl`. O "Abrir" do card vira um botão que mostra o passo a passo num modal — nunca finge abrir a ferramenta sozinho.

O campo `icon` (chave de um `<symbol id="icon-...">` já definido no início de `index.html`) controla o ícone do card; a cor é sempre o azul de marca (não há mais cor por card). Se precisar de um ícone novo, adicione o `<symbol>` correspondente no sprite inline do `index.html` (mantenha os SVGs inline — evita depender de carregar um arquivo `.svg` externo via `file://`, o que é inconsistente entre navegadores).

## Identidade visual

Direção "Constelação" (escolhida a partir de um mockup de referência): fundo escuro com um campo de estrelas em canvas (`assets/js/starfield.js`), cards em vidro fosco num grid tipo masonry (`columns` em CSS, sem JS de layout), tipografia grande com tracking negativo.

Cores e tipografia seguem o **brandbook oficial da GBEX** (`REFERÊNCIAS PAINEL DP/gbex-brandbook.pdf`):

- Gbex Blue `#36A9E1` (PANTONE 298C) e Asphalt `#314084` (PANTONE 3584C) — únicas cores de marca; o roxo que aparecia no mockup de referência não é oficial e foi substituído por azul.
- Tipografia institucional é Geom Graphic Bold (títulos) + Acumin Pro (texto) — são fontes pagas, sem arquivo disponível aqui. Uso a Inter (licença livre, SIL OFL) via Google Fonts como aproximação, com fallback automático para a fonte do sistema se não houver internet. Se a empresa tiver os arquivos licenciados de Geom Graphic/Acumin Pro, dá pra trocar via `@font-face` em `styles.css` para ficar 100% fiel à marca.
- A logo usada é a variante colorida (`LOGO_GBEX_3-removebg-preview.png`); sobre fundo escuro ela aparece em branco via filtro CSS (`filter: brightness(0) invert(1)`), aproximando a variante "Negativa" prevista no manual — não temos o arquivo separado dessa variante.

## Por que sem framework/build

Todas as outras ferramentas deste workspace são autocontidas (HTML único ou processo local simples). O Painel DP segue o mesmo padrão de propósito: abrir por duplo clique, sem `node_modules`, sem passo de compilação. Os scripts são clássicos (sem `type="module"`, sem `import`/`export`) porque abrir a página via `file://` bloqueia workers/módulos ES em alguns navegadores — a mesma razão documentada em `PROJETO MD/files(4)/conversor-folha/LEIA-ME.md` para a ferramenta de conversão de folha. Pela mesma razão, testamos ao vivo se dava pra usar three.js/WebGL real na abertura: funciona, mas quebra sem internet — por isso a abertura usa só CSS 3D (nunca falha, mesmo offline).
