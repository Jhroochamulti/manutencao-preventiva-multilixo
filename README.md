# Sistema de Manutenção Multilixo

Aplicação web para gestão de manutenção de frota, caminhões e máquinas, com autenticação e banco de dados online no Firebase.

## Aplicação oficial

- `index.html`: redireciona para a aplicação atual.
- `sistema.html`: entrada principal.
- `sistema.css`: layout responsivo e identidade visual.
- `sistema.js`: regras de negócio, formulários, dashboards, filtros e exportações.
- `firebase-config.js`: configuração pública do aplicativo web Firebase.
- `firestore.rules`: regras de acesso que devem ser publicadas no Firebase.

As páginas antigas permanecem na pasta apenas como legado durante a transição. A versão oficial é `sistema.html`.

## Módulos

- Painel geral da manutenção
- Frota
- Preventivas
- Painel das preventivas
- Corretivas
- Materiais
- VTR / MTR
- SLA
- Relatórios

## Filtros e análises

Os módulos oficiais possuem o card **Filtros de Análise**, com persistência local por navegador e atualização dos indicadores, gráficos e tabelas:

- Frota: equipamento/frota, modelo, fabricante, classe operacional, filial, status e ativo/inativo.
- Preventivas: equipamento, filial, classe operacional, tipo, prioridade, status e datas do processo.
- Painel das preventivas: equipamento, filial, classe operacional, prioridade, tipo, status e período.
- Corretivas: equipamento, filial, classe operacional, status, prioridade, equipamento parado, tipo de falha e datas.
- Materiais: equipamento, filial, classe operacional, tipo de manutenção, status, material, fornecedor e datas.
- VTR/MTR: classe operacional, filial, equipamento, status, retenção, peças e período.
- SLA: filial, equipamento, classe operacional, prioridade, status, situação do SLA e período.
- Relatórios: equipamento, filial, classe operacional, tipo de manutenção, status e período.

### Hierarquia de classificação

- **Classe mecânica**: agrupamento técnico principal do ativo, como `Caminhões e Similares`, `Maquinas e Similares`, `Utilitário (VUC)` e `Geradores`.
- **Classe operacional**: aplicação do ativo dentro da classe mecânica, como `Prensa`, `Polly`, `Rollon`, `Escavadeira Hidraulica`, `Harvester` e `Pá Carregadeira`.

Ao selecionar uma classe mecânica, o filtro de classe operacional mostra somente as opções vinculadas àquele grupo.

## Painel VTR/MTR

O painel mantém os indicadores de frota, retenção e disponibilidade e inclui:

- análise por classe mecânica e classe operacional;
- percentual de retenção e disponibilidade;
- ativos aguardando peças;
- média e maior tempo de parada;
- rankings executivos;
- gráficos comparativos;
- exportação Excel da análise de retenções.

As métricas usam somente a frota oficial do Firestore e as corretivas vinculadas por `fleetId`. Um ativo é tecnicamente retido apenas quando a corretiva está aberta e `isStopped` é verdadeiro.

## Fontes de dados

O Firebase Firestore é a fonte oficial dos dados operacionais:

- `fleet`: inventário oficial da frota.
- `preventives`: manutenções preventivas.
- `correctives`: manutenções corretivas.
- `materials`: solicitações de materiais.

Todos os registros usam `fleetId` para relacionar equipamento, placa, modelo, filial, manutenção, material, SLA, VTR e MTR.

O módulo **Painel das preventivas** lê a planilha publicada do Google Sheets em formato CSV. As preventivas vencidas são identificadas pelo valor em horas das colunas `Vencida` ou `Atraso`: valores maiores que zero são vencidos. A aderência considera a janela de 50 horas antes até 50 horas depois do vencimento.

## Regras principais

- VTR/MTR considera corretivas abertas, com equipamento parado e vinculadas à frota oficial.
- O VTR/MTR apresenta as classes operacionais com mais corretivas, ativos afetados, retidos atuais e falhas por 100 ativos.
- Solicitações abertas de material corretivo também classificam o equipamento retido como aguardando peças.
- Preventivas podem ser salvas com etapas pendentes.
- Datas não podem retroceder no fluxo.
- Materiais preventivos e corretivos entram nos indicadores de prazo.
- Registros concluídos ou cancelados não permanecem como manutenções abertas.

## Metas

- Lead time total da preventiva: 2,5 dias.
- Solicitação até disponibilidade: 0 dia.
- Disponibilidade até retirada: 0,5 dia.
- Retirada até execução: 2 dias.
- Corretiva crítica: 4 horas.
- Corretiva alta: 12 horas.
- Corretiva média: 24 horas.
- Corretiva baixa: 72 horas.

## Como executar localmente

Na pasta `outputs`, inicie um servidor estático:

```powershell
python -m http.server 4173
```

Acesse `http://localhost:4173/sistema.html`.

Não abra por `file:///`, pois Firebase Authentication e Firestore precisam de uma origem web.

## Fluxo dos módulos

1. A frota é importada para a coleção `fleet`.
2. Preventivas, corretivas e materiais selecionam um ativo da frota e gravam o mesmo `fleetId`.
3. Painel geral, SLA, VTR/MTR e relatórios calculam indicadores a partir dessas coleções.
4. O Painel das preventivas usa a fonte CSV publicada configurada na própria tela.
5. Filtros são aplicados somente no navegador e não alteram os registros do Firestore.

## Configuração obrigatória do Firebase

1. Ative o provedor **E-mail/senha** em `Authentication > Método de login`.
2. Cadastre somente usuários autorizados em `Authentication > Usuários`.
3. Abra `Firestore Database > Regras`.
4. Substitua o conteúdo pelas regras do arquivo `firestore.rules`.
5. Clique em **Publicar**.

As contas cadastradas no Firebase são as pessoas autorizadas a consultar e alterar os dados.

## Publicação no GitHub Pages

1. Envie o conteúdo da pasta `outputs` para o repositório.
2. No GitHub, abra `Settings > Pages`.
3. Selecione `Deploy from a branch`.
4. Escolha a branch principal e a pasta raiz.
5. Aguarde a publicação e abra a URL do GitHub Pages.

## Checklist antes de publicar

- Publicar `firestore.rules` no Firebase.
- Confirmar que o login autorizado funciona.
- Validar o link CSV do Painel das preventivas.
- Testar criação, edição e exclusão de um registro controlado.
- Conferir os indicadores do Painel geral, SLA e VTR/MTR.
- Verificar o site em computador e celular.
- Executar `node --check sistema.js`.
- Confirmar ausência de erros no console nas rotas oficiais.
- Validar os filtros e o botão **Limpar filtros** em cada módulo.
- Conferir a exportação Excel do VTR/MTR e dos relatórios.

## Segurança

A configuração presente em `firebase-config.js` identifica o aplicativo web e não é uma senha. A proteção real é feita pelo Firebase Authentication e pelas regras do Firestore.

Exclusões exigem confirmação no frontend. Não há senhas de usuários, tokens privados ou credenciais administrativas armazenadas no repositório.
