# Projeto salvo no Codex

Projeto: Manutencao Preventiva de Maquinas - Multilixo

Status: salvo e pronto para publicacao estatica no GitHub Pages.

Versao final: v50.

Ultimas atualizacoes:

- Campos adicionados: filial, modelo e ano.
- Informacoes gerais usando a mesma fonte das novas solicitacoes.
- Botoes Editar e Excluir ajustados para nao sobrepor texto.
- Corrigido retorno automatico dos exemplos depois de excluir todos os registros.
- Base de inventario adicionada para preencher equipamento, filial, modelo e ano ao digitar a placa.
- Metas adicionadas aos indicadores: lead time total 2,5 dias, solicitacao ate disponibilidade 0 dia, disponivel ate retirada 0,5 dia e retirada ate execucao 2 dias.
- Metas exibidas tambem no painel principal de gargalos.
- Nova pagina Painel geral das preventivas criada para consumir Google Sheets publicado como CSV.
- Link CSV do Google Sheets configurado como fonte padrao do Painel geral das preventivas.
- Indicadores do painel geral das preventivas ajustados para a fonte: frota monitorada, em dia, vencidas, vencem em ate 30 dias, maior atraso e aderencia.
- Indicadores principais usando o resumo oficial da planilha: Frota Op., Em dia e Vencidas.
- Grafico de linha unica adicionado com em dia, aderencia e vencidas.
- Regra de aderencia ajustada para desvio entre -50h e +50h.
- Grafico de aderencia com percentual em cada faixa e quantidade no hover.
- Grafico ajustado para manter em dia e vencidas como base, com aderencia ±50h sobreposta em azul.
- Faixa azul de aderencia posicionada na transicao entre em dia e vencidas.
- Atrasos do painel geral tratados em horas; preventivas por filial contam apenas vencidas; clique na faixa vermelha filtra equipamentos vencidos.
- Aderencia exibida junto da barra principal, entre em dia e vencidas.
- Aderencia mantida dentro da barra como faixa azul sobreposta na janela de vencimento, sem alterar a base verde/vermelha.
- Percentual de vencidas reposicionado para nao ser coberto pela faixa de aderencia.

Arquivos principais:

- `index.html`
- `geral.html`
- `painel-preventivas.html`
- `styles.css`
- `app.js`
- `geral.js`
- `painel-preventivas.js`
- `assets/logo-multilixo.png`
- `README.md`
- `.nojekyll`

Pacote compactado:

- `manutencao-preventiva-multilixo.zip`

Publicação recomendada:

Envie o conteudo da pasta `outputs` para a raiz de um repositorio GitHub e ative o GitHub Pages em `Settings > Pages`.
