# Referencia VTR/MTR

Base analisada: `Multilixo_VTR_MTR_2026 (1).xlsx`.

## Estrutura observada

- `PAINEL GERAL`: visao consolidada de caminhoes e maquinas.
- `PAINEL-CAMINHOES`: painel VTR - Veiculos Tecnicamente Retidos.
- `BASE_CAMINHOES`: base operacional dos caminhoes retidos.
- `PAINEL-MAQUINAS`: painel MTR - Maquinas Tecnicamente Retidas.
- `BASE_MAQUINAS`: base operacional das maquinas retidas.
- `BASE INVENTARIO`: inventario completo de equipamentos.
- `DINAMICA`: resumo por situacao, classe mecanica e classe operacional.
- `Lista motivos`: listas de motivos, tipo de parada, peca/servico e condicao atual.

## Indicadores principais da planilha

- Frota patrimonial.
- Frota operacional.
- VTR retidos para caminhoes.
- MTR retidas para maquinas.
- Disponibilidade operacional.
- Motivos de parada.
- Tipo de manutencao.
- Peca ou servico.
- Condicao atual.
- Previsao de saida.

## Campos-base importantes

### Caminhoes

- Prefixo.
- Data entrada.
- Placa.
- OS.
- Classe.
- Modelo chassi.
- Proprietario.
- KM.
- Tipo de manutencao.
- Tipo de parada.
- Peca ou servico.
- Prognostico.
- Diagnostico.
- Fornecedor.
- Condicao atual.

### Maquinas

- Data parada.
- Placa.
- OS.
- Dispositivo / equipamento.
- Motivo de parada.
- Filial / operacao.
- Ano.
- Horimetro.
- Tipo de parada.
- Peca ou servico.
- Causa raiz do problema.
- Local do servico.
- Condicao atual detalhe.
- Condicao atual.
- Previsao saida.

## Direcao para o sistema

O painel principal deve separar claramente:

- VTR Caminhoes.
- MTR Maquinas.
- Visao consolidada da manutencao.
- Gargalos por filial, classe, motivo, tipo de parada e condicao atual.

As telas operacionais devem permitir carregar ou cadastrar os dados que alimentam esses indicadores.
