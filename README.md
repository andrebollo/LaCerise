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

## Como os dados são guardados (banco único da La Cerise)

O app usa **Firebase Authentication** (login por e-mail/senha, sem
autocadastro) e **Firestore** (banco de dados na nuvem). Todos os dados
ficam num só lugar: quem cadastra um ingrediente, uma receita ou um
orçamento, todo mundo da equipe vê e pode editar — não existem "áreas
separadas" por pessoa.

### Configurando o Firebase (uma vez só)

1. **Ative o login por e-mail/senha**: console do Firebase → *Build* →
   *Authentication* → aba *Sign-in method* → ative *Email/Password*.
2. **Crie o banco**: *Build* → *Firestore Database* → *Create database* →
   modo produção.
3. **Cole as regras de segurança**: na aba *Rules* do Firestore, apague o
   conteúdo e cole o que está em `firestore.rules` desta pasta →
   *Publish*.
4. **Autorize o domínio**: se for publicar em `https://seuusuario.github.io`,
   adicione esse domínio em *Authentication* → *Settings* → *Authorized
   domains*.

As credenciais do projeto já estão preenchidas em `firebase-config.js`.

### Cadastrando quem pode usar o app

Não existe tela de "criar conta" no app — por segurança, só entra quem
você cadastrar manualmente:

1. Console do Firebase → *Build* → *Authentication* → aba *Users*.
2. Botão **Add user** → digite o e-mail e uma senha provisória da pessoa.
3. Avise a pessoa da senha (ela pode ser trocada depois, se você adicionar
   uma tela de "esqueci minha senha" — hoje isso não está implementado).

Para remover o acesso de alguém, exclua o usuário na mesma tela.

### Se a equipe já usava a versão anterior (dados só no celular)

Na primeira vez que alguém logar num celular com dados antigos salvos
localmente, o app pergunta se quer copiá-los para o banco compartilhado.
Se **duas pessoas** tiverem dados antigos diferentes, o ideal é migrar
de um celular por vez, conferindo se não vira ingrediente/receita
duplicada.

### Backup manual

Vale usar **⋮ → Exportar backup** de vez em quando para guardar uma cópia
extra em `.json` no celular, mesmo com os dados na nuvem.

## Evoluindo ainda mais

- **Sincronização em tempo real**: hoje cada tela busca os dados quando é
  aberta. Dá para trocar por `onSnapshot` do Firestore para a tela
  atualizar sozinha quando outra pessoa da equipe mexer nos dados ao
  mesmo tempo.
- **Histórico de quem mexeu em quê**: já gravo `criadoPor`/`editadoPor`
  (e-mail de quem fez a ação) em cada registro — dá para mostrar isso nas
  telas se for útil para auditoria.
- **Permissões por pessoa** (ex: só o financeiro edita preço de venda):
  hoje todo mundo pode editar tudo, de propósito, pela sua descrição.
  Se um dia quiser limitar, dá para adicionar `papel` (função) no
  cadastro de cada usuário e checar isso nas regras do Firestore.
- **"Esqueci minha senha"**: fácil de adicionar com
  `sendPasswordResetEmail` do próprio Firebase Auth.
- **Login com Google**: evita a etapa de senha, mantendo o cadastro
  manual (você ainda decide quem entra, adicionando o e-mail da pessoa
  como usuário autorizado).

## Arquivos

- `index.html` — estrutura da página
- `styles.css` — visual do app
- `app.js` — telas, formulários, navegação, login
- `storage.js` — acesso aos dados via Firebase (Auth + Firestore, banco único)
- `firebase-config.js` — credenciais do projeto Firebase da La Cerise
- `firestore.rules` — regras de segurança para colar no console do Firebase
- `manifest.json` / `service-worker.js` — o que torna o app instalável e
  utilizável offline
- `icons/` — ícone do app
