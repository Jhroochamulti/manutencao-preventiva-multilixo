# Sistema de Manutencao Multilixo - V2

Esta versao foi criada como uma base limpa da aplicacao, com o Firebase como fonte unica de dados.

## Entrada oficial

- `index.html`: redireciona para a aplicacao nova.
- `sistema.html`: shell principal da aplicacao.
- `sistema.css`: identidade visual e layout.
- `sistema.js`: regras de negocio, Firebase, CRUD, indicadores e exportacao.

## Fonte unica

Todas as telas oficiais usam as colecoes do Firestore:

- `fleet`: frota total, caminhões, maquinas e utilitarios.
- `preventives`: preventivas.
- `correctives`: corretivas.
- `materials`: materiais de preventivas e corretivas.

Todos os registros operacionais precisam ter `fleetId`. O `fleetId` e a chave que conecta frota, preventiva, corretiva, material, SLA, VTR e MTR.

O inventario oficial da aplicacao e a colecao `fleet` ja carregada no Firestore. A planilha de VTR/MTR deve ser usada apenas como referencia de indicadores, nomes de visoes e logica gerencial, nao como fonte de inventario.

## Regras validadas

- VTR/MTR considera somente corretivas abertas, com equipamento parado e vinculadas a um ativo da frota.
- Materiais preventivos entram no controle de prazo, pois preventiva nao pode atrasar por falta de material.
- Materiais corretivos entram no gargalo quando estao ligados a equipamentos parados/aguardando peca.
- Dados antigos e exemplos nao entram na nova aplicacao.

## Arquivos legados

As paginas antigas continuam na pasta apenas como referencia durante a transicao. A aplicacao oficial deve ser acessada por `sistema.html`.
