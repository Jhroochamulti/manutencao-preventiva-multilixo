# Desenvolvimento Firebase

Esta branch (`firebase-app-dev`) e destinada a evoluir o projeto atual para uma aplicacao web completa de gestao de frota e manutencao.

## Regra de publicacao

Nao publicar esta branch no GitHub Pages sem aprovacao explicita.

A branch `main` permanece como a versao publicada e funcional do site atual.

## Modelo alvo

- Codigo: GitHub
- Hospedagem: GitHub Pages
- Banco de dados: Firebase Firestore
- Login: Firebase Authentication
- Anexos: evitar no inicio
- Dashboard: dentro do proprio sistema

## Modulos previstos

- Dashboard
- Frota
- Caminhoes
- Maquinas
- Preventivas
- Corretivas
- Materiais
- SLA
- Relatorios
- Usuarios

## Inventario analisado

Arquivo analisado: `W:\inventario frota completa.xlsx`

Resumo:

- Total de ativos: 972
- Caminhoes e similares: 643
- Maquinas e similares: 251
- Utilitario/VUC: 52
- Geradores: 26

Campos disponiveis:

- Classe Mecanica
- Equipamento
- Placa
- Ano Modelo
- Classe Operacional
- Fabricante
- Modelo
- Filial

Chave recomendada para importacao: `Equipamento`.

Motivo: nao possui vazios nem duplicidades no inventario analisado. A placa possui duplicidades.

## Fluxo recomendado de atualizacao da frota

Criar uma tela `Importar Frota` para carregar periodicamente um arquivo `.xlsx` ou `.csv`.

O sistema deve comparar a nova base com o Firestore e exibir:

- novos ativos;
- ativos alterados;
- ativos removidos/inativados;
- possiveis inconsistencias.

A confirmacao final deve sincronizar os dados com a colecao `fleet`.
