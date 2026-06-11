# Checkpoint para continuar

Data: 2026-06-09

## Direcao definida

Vamos seguir com a V2 da aplicacao, refeita de forma limpa.

A entrada oficial e:

- `index.html`: redireciona para `sistema.html`.
- `sistema.html`: aplicacao principal.
- `sistema.css`: layout e identidade visual.
- `sistema.js`: regras de negocio, Firebase, CRUD, indicadores e relatorios.

## Fonte oficial de dados

O inventario oficial e somente a colecao `fleet` do Firestore.

A planilha de VTR/MTR enviada deve servir apenas como referencia de indicadores, nomes e estrutura visual. Ela nao deve ser usada como inventario.

## Decisoes importantes

- Tudo deve ser vinculado por `fleetId`.
- A base de frota online carregada no Firestore tem 972 ativos.
- VTR/MTR deve considerar somente corretivas abertas, com equipamento parado e vinculadas a um ativo da frota.
- MTR/VTR nao deve puxar equipamentos da planilha modelo.
- Materiais preventivos e corretivos entram no controle de prazos.
- Preventivas, corretivas e materiais devem buscar equipamento por frota, placa, modelo, fabricante, filial e classe operacional.

## O que ja foi feito na V2

- Criada aplicacao limpa em `sistema.html`.
- Criado layout novo em `sistema.css`.
- Criada logica central em `sistema.js`.
- Criada navegacao com:
  - Painel geral
  - Frota
  - Preventivas
  - Corretivas
  - Materiais
  - VTR / MTR
  - SLA
  - Relatorios
- `index.html` agora redireciona para a V2.
- Tela de Frota deixou de listar todos os ativos um a um.
- Tela de Frota agora mostra graficos por:
  - caminhões por classe operacional
  - maquinas por classe operacional
  - caminhões por filial
  - maquinas por filial
  - outros ativos
- Adicionada busca inteligente de equipamento nos formularios.

## Proximo passo recomendado

Retomar testando manualmente a V2 em:

`http://localhost:4173/sistema.html?v=5`

Depois validar:

1. Cadastro de preventiva com busca por placa/modelo.
2. Cadastro de corretiva com equipamento parado.
3. Cadastro de material preventivo/corretivo.
4. Reflexo no painel VTR/MTR.
5. Reflexo no SLA e relatorios.
6. Quando aprovado, limpar ou aposentar paginas antigas e publicar no GitHub Pages.
