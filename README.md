# Manutencao Preventiva de Maquinas - Multilixo

Site estatico para acompanhamento de manutencao preventiva de maquinas, com foco em SLA operacional, status das etapas e gargalos do processo.

## Funcionalidades

- Cadastro de nova preventiva.
- Campos do equipamento: equipamento, placa, filial, modelo e ano.
- Preenchimento automatico pela placa usando a base estatica `assets/inventario-data.js`.
- Indicadores com metas: lead time total 2,5 dias; solicitacao ate disponibilidade 0 dia; disponivel ate retirada 0,5 dia; retirada ate execucao 2 dias.
- Metas exibidas nos cards superiores e no painel principal de gargalos.
- Nova pagina `Painel geral das preventivas` preparada para ler Google Sheets publicado como CSV.
- Indicadores da planilha diaria: frota monitorada, em dia, vencidas, vencem em ate 30 dias, maior atraso e aderencia.
- Aderencia definida por desvio entre -50h e +50h em relacao ao vencimento.
- Grafico de aderencia com percentuais visiveis e quantidade por faixa no hover.
- No grafico, em dia e vencidas formam a linha base; aderencia ±50h aparece sobreposta em azul.
- Atrasos do painel geral medidos em horas; clique na faixa vermelha do grafico filtra os equipamentos vencidos.
- Aderencia exibida dentro da barra principal como faixa azul sobreposta na janela de vencimento.
- Campo de status alinhado entre cadastro, painel e informacoes gerais.
- Edicao e exclusao pelo painel principal.
- Edicao e exclusao pela pagina de informacoes gerais.
- Datas de solicitacao, disponibilizacao, retirada e execucao.
- Salvamento de preventivas com etapas pendentes.
- Calculo de gaps em tempo real para etapas ainda nao concluidas.
- Indicadores de lead time total e dias medios por etapa.
- Dashboards com filtros por periodo, status e tipo de gargalo.
- Ranking dos maiores gargalos por equipamento.
- Exportacao para Excel via CSV compativel com Excel.
- Exportacao para PDF via relatorio para imprimir/salvar como PDF.
- Persistencia local via localStorage.

## Fonte de dados

A pagina `Informacoes gerais` usa a mesma base local das novas solicitacoes cadastradas no painel principal.

A pagina `Painel geral das preventivas` usa o link CSV publicado do Google Sheets como fonte padrao. O usuario tambem pode substituir o link na propria pagina; nesse caso, a fonte fica salva no navegador pela chave `multilixo-painel-preventivas-csv-url`.

Os dados sao salvos no navegador pelo `localStorage`, na chave:

`multilixo-preventivas`

## Arquivos do site

- `portal.html`: entrada do sistema, separando paineis de operacao e paineis de analise.
- `mtr.html`: painel geral executivo com indicadores consolidados da manutencao.
- `index.html`: painel principal e formulario de cadastro.
- `geral.html`: informacoes gerais, dashboards, filtros e tabela analitica.
- `painel-preventivas.html`: painel geral alimentado por Google Sheets publicado como CSV.
- `styles.css`: estilos e identidade visual Multilixo.
- `app.js`: logica do painel principal.
- `geral.js`: logica da pagina de informacoes gerais.
- `painel-preventivas.js`: logica do painel geral da planilha diaria.
- `assets/logo-multilixo.png`: logo usada no site.
- `.nojekyll`: arquivo auxiliar para publicacao direta no GitHub Pages.
- `PROJETO_SALVO.md`: registro do projeto salvo no Codex.

## Como publicar no GitHub Pages

1. Crie um repositorio no GitHub.
2. Envie todo o conteudo desta pasta `outputs` para a raiz do repositorio.
3. No GitHub, acesse `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Escolha a branch principal, normalmente `main`, e a pasta `/root`.
6. Salve e aguarde o GitHub gerar a URL do site.

## Importante

Este site e estatico. Os dados ficam salvos no navegador do usuario por meio de localStorage.

Para uso multiusuario, banco de dados, login ou compartilhamento entre computadores, sera necessario adicionar backend ou integracao externa.
