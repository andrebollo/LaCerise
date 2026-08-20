# Doces & Custos — app local para Android

App web (PWA) que reproduz a planilha de controle de custos: Ingredientes,
Receitas (com % de cada ingrediente e cálculo automático de custo),
Resumo de Custos, Orçamentos e Balanço Geral — tudo com cálculo automático,
funcionando **offline**, com os dados guardados **só no seu celular**.

Não é um .apk (não compilei um app nativo). É um site que se instala como
um app: ganha ícone na tela, abre em tela cheia, funciona sem internet.
Essa forma foi escolhida de propósito: é o caminho mais rápido para depois
migrar para nuvem com múltiplos usuários sem reescrever as telas (veja
"Evoluindo para nuvem" abaixo).

## Instalando no Android (recomendado — 5 minutos, grátis)

Para o Android reconhecer o app como instalável (com ícone e uso offline
de verdade), os arquivos precisam estar num endereço `https://`. A forma
mais simples e gratuita é o **GitHub Pages**:

1. Crie uma conta gratuita em github.com (se ainda não tiver).
2. Crie um repositório novo (pode ser privado), por exemplo `doces-custos`.
3. Envie todos os arquivos desta pasta para o repositório (pelo site do
   GitHub: "Add file" → "Upload files", arraste todos os arquivos e a
   pasta `icons`).
4. No repositório, vá em **Settings → Pages**, em "Source" escolha a
   branch `main` e a pasta `/root`, e salve.
5. Em alguns minutos o GitHub mostra o endereço do site (algo como
   `https://seuusuario.github.io/doces-custos/`).
6. Abra esse endereço no Chrome do celular. Vai aparecer um aviso (ou
   um item no menu ⋮ do Chrome) **"Instalar aplicativo"** / **"Adicionar
   à tela inicial"**. Toque para instalar — o ícone do app aparece na
   tela do celular como qualquer outro app.

Qualquer outro serviço de hospedagem de site estático (Netlify, Vercel,
Cloudflare Pages) funciona do mesmo jeito e também é gratuito.

## Usando sem publicar em lugar nenhum (mais rápido, com limitações)

Se quiser só testar agora: descompacte a pasta no celular, abra o arquivo
`index.html` pelo gerenciador de arquivos (escolha "Abrir com" → Chrome).
O app funciona normalmente, mas o Android não permite instalar de verdade
um site aberto assim (fica só como aba do navegador) — para o ícone na
tela e uso 100% offline, vale a pena publicar pelo GitHub Pages.

## Como os dados são guardados

Tudo fica salvo no armazenamento local do navegador (localStorage), dentro
do próprio celular — nada é enviado para a internet. Use o menu **⋮ →
Exportar backup** de vez em quando (e principalmente antes de trocar de
celular ou limpar dados do navegador) para salvar uma cópia em `.json`.
Esse mesmo arquivo pode ser restaurado depois em **⋮ → Importar backup**.

## Evoluindo para nuvem com múltiplos usuários

Esse é o motivo de o app ter sido estruturado assim desde o início: toda
tela conversa **só** com o arquivo `storage.js`, e todas as funções dele já
são assíncronas — hoje leem do localStorage, mas o formato é idêntico ao
de uma chamada de API. Isso significa que dá para trocar "o motor" sem
tocar nas telas. Um guia passo a passo está escrito como comentário no
final do próprio `storage.js`. Resumo:

1. Criar um projeto no **Supabase** ou **Firebase** (login pronto e banco
   na nuvem, sem precisar programar um servidor do zero).
2. Criar 3 tabelas: `ingredientes`, `receitas`, `orcamentos`, com os
   mesmos campos que já existem hoje (mais uma coluna `userId`).
3. Reescrever só as funções de leitura/escrita em `storage.js` para
   chamar o Supabase/Firebase em vez do localStorage.
4. Adicionar uma tela de login simples.

Nenhuma tela (`app.js`) precisa mudar nesse processo.

## Arquivos

- `index.html` — estrutura da página
- `styles.css` — visual do app
- `app.js` — telas, formulários, navegação
- `storage.js` — acesso aos dados (o ponto de troca para a nuvem)
- `manifest.json` / `service-worker.js` — o que torna o app instalável e
  utilizável offline
- `icons/` — ícone do app
