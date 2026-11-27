# SmartSower

**App:** https://smartsower.app

Web app para preparar e pregar ministrações. É feito para o Surface (Windows, com caneta), funciona offline e sincroniza entre aparelhos pelo Supabase.

- **Editor no estilo OneNote:** cadernos, seções e páginas, com **ordem manual e subpáginas** (⋯ na página, arrastar, Ctrl+Alt+] / Ctrl+Alt+[). Os blocos podem ser Ponto, Introdução, Texto, Versículo, Ilustração, Aplicação, Frase-chave, Conclusão, Desenho (caneta) e Imagem, além dos tipos que você criar.
- **Modo pregação:** rolagem automática (toque para pausar) ou ponto a ponto, pinça para mudar o tamanho da letra, cronômetro, estimativa de duração calibrada pelo seu ritmo e tela sempre ligada.
- **Bíblia offline:** Bíblia Livre (CC BY 4.0) e outras versões para uso pessoal, com busca e inserção de versículos.
- **Estudo no original (Strong):** 🔍 em qualquer versículo mostra o hebraico/grego palavra por palavra, com número de Strong, transliteração e léxico; a IA explica a palavra em português e liga cada termo à sua tradução.
- **Revisão com IA:** Claude e Gemini avaliam o sermão lado a lado; o app confere as referências bíblicas.
- **Pós-culto:** tempo por ponto, transcrição ao vivo e análise “planejado x pregado” (posts e devocional).
- **Importação do OneNote:** **Novo caderno › Importar caderno do OneNote** (cada seção exportada vira uma seção), caderno inteiro em .mht, ou copiar e colar. Na lista de páginas, **☑ Selecionar** permite mover várias páginas para outra seção de uma vez.
- **Exportação:** PDF, Word e backup .json.
- **Nuvem:** login e sincronização entre aparelhos (Supabase). O app continua funcionando sem internet.

O app é um único `index.html` sem dependências externas. O código-fonte está em `src/` e o `build.py` gera o `index.html` da raiz.

---

## 1. Configurar o Supabase (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole o conteúdo de [`supabase.sql`](supabase.sql) e clique em **Run**. O script cria as tabelas, as regras de segurança (cada usuário só acessa os próprios dados) e o armazenamento de imagens.
3. Em **Project Settings › API**, copie a **Project URL** e a chave **anon public**. Cole as duas em [`config.js`](config.js):
   ```js
   window.SMARTSOWER_CONFIG = {
     supabaseUrl: 'https://SEU-PROJETO.supabase.co',
     supabaseAnonKey: 'eyJ...'
   };
   ```
   A chave *anon* foi feita para ficar no navegador. A proteção dos dados vem das regras (RLS) do `supabase.sql`.
4. Em **Authentication › URL Configuration**, coloque o endereço publicado do app em **Site URL** e em **Redirect URLs**, no caso `https://smartsower.app/`.
5. Crie a sua conta pelo próprio app (☁ **Entrar › Criar conta**) e confirme o e-mail.
6. **Recomendado:** depois de criar a sua conta (e as da equipe), desative novos cadastros em **Authentication › Sign In / Providers › Allow new users to sign up**. Assim ninguém de fora consegue criar conta no seu projeto.
7. *(Opcional)* Para entrar com Google, ative o provedor em **Authentication › Sign In / Providers › Google**. Isso exige um OAuth Client do Google Cloud.

> **Plano gratuito do Supabase:** projetos sem uso por uma semana são pausados. Os dados ficam guardados, mas é preciso reativar o projeto no painel. Enquanto isso, o SmartSower continua funcionando com a cópia local e sincroniza quando o projeto voltar.

## 2. Publicar

- **Repositório público:** use **Settings › Pages › Deploy from a branch › `main` / root**. O app fica em `https://<usuario>.github.io/<repositorio>/`.
- **Repositório privado:** o GitHub Pages em repositório privado exige plano pago. Conecte o repositório ao **Cloudflare Pages** ou ao **Netlify** (gratuitos, aceitam repositório privado), sem comando de build e com a pasta raiz publicada.

## 3. Instalar no Surface e no notebook

Abra o endereço no **Microsoft Edge** e use **⋯ › Aplicativos › Instalar este site como um aplicativo**. Depois, em cada aparelho, use **☁ Entrar** com a mesma conta.

## Como a sincronização funciona

- Tudo é salvo primeiro no aparelho (IndexedDB) e enviado ao Supabase em segundo plano: ao abrir o app, alguns segundos depois de editar, ao voltar a ter internet e a cada 90 segundos.
- Cada ministração guarda a data da última edição.
  - Se só um aparelho mudou, essa versão vai para os outros.
  - **Se a mesma ministração foi editada nos dois aparelhos antes de sincronizar**, as duas versões são mantidas: a da nuvem continua e a outra aparece como “(conflito — outra versão, data)”.
- Exclusões também sincronizam.
- Cadernos, seções e tipos de bloco sincronizam. Seções com o mesmo nome criadas antes do primeiro login são unificadas, não duplicadas.
- As imagens vão para o Storage do Supabase (pasta privada do usuário). A Bíblia baixada fica em cada aparelho.

## Desenvolvimento

```bash
python3 build.py   # junta src/* em index.html (sem dependências)
python3 -m http.server 8000   # abra http://localhost:8000
```

Arquivos em `src/`:

| Arquivo | O que faz |
|---|---|
| `core.js` | utilidades, IndexedDB, modais |
| `books.js` | livros da Bíblia e leitura de referências |
| `bible.js` | download e consulta das versões |
| `app.js` | navegação e editor de blocos |
| `ink.js` | caneta e desenhos |
| `reader.js` | modo pregação |
| `estimate.js` | estimativa de duração |
| `theme.js` | temas claro e escuro |
| `porter.js` | importação (OneNote, Word, MHT) e exportação (PDF, DOCX, backup) |
| `onenote.js` | importação direta via Microsoft Graph |
| `cloud.js` | login e sincronização com o Supabase |
| `supabase.sql` | estrutura do banco |

Textos originais: Open Scriptures Hebrew Bible (WLC, CC BY 4.0), SBLGNT/MorphGNT, léxico de Strong (domínio público, Open Scriptures).

Texto bíblico da Bíblia Livre: © Diego Santos, Mario Sérgio e Marco Teles, licença CC BY 4.0. As demais versões têm direitos autorais dos seus detentores e servem só para uso pessoal.
