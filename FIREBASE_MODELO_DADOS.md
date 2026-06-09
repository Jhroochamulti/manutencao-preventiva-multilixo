# Modelo de Dados Firebase

Este documento descreve a estrutura inicial recomendada para migrar a aplicacao de manutencao para Firebase Firestore.

## Colecoes

### `fleet`

Cadastro mestre da frota.

ID recomendado do documento: `Equipamento`.

Campos:

- `equipment`
- `plate`
- `mechanicalClass`
- `operationalClass`
- `manufacturer`
- `model`
- `yearModel`
- `branch`
- `category`
- `active`
- `source`
- `createdAt`
- `updatedAt`
- `importedAt`

Categorias previstas:

- `caminhao`
- `maquina`
- `utilitario`
- `gerador`
- `outro`

### `preventives`

Ordens e controles de manutencao preventiva.

Campos previstos:

- `fleetId`
- `equipment`
- `plate`
- `branch`
- `model`
- `yearModel`
- `serviceType`
- `status`
- `requestDate`
- `availableDate`
- `pickupDate`
- `executionDate`
- `notes`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

Status previstos:

- `Aberto`
- `Em atendimento`
- `Aguardando peca`
- `Concluido`
- `Cancelado`

### `correctives`

Chamados e manutencoes corretivas.

Campos previstos:

- `fleetId`
- `equipment`
- `plate`
- `branch`
- `failureType`
- `description`
- `priority`
- `status`
- `openedAt`
- `assignedTo`
- `startedAt`
- `finishedAt`
- `downtimeHours`
- `notes`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

### `materials`

Controle de material ligado a preventivas ou corretivas.

Campos previstos:

- `maintenanceId`
- `maintenanceType`
- `material`
- `quantity`
- `unit`
- `status`
- `requestedAt`
- `availableAt`
- `pickedUpAt`
- `supplier`
- `notes`

### `users`

Cadastro complementar dos usuarios autenticados pelo Firebase Authentication.

ID recomendado: `uid` do Firebase Auth.

Campos:

- `name`
- `email`
- `role`
- `branches`
- `active`
- `createdAt`
- `updatedAt`

Perfis previstos:

- `admin`
- `planejamento`
- `almoxarifado`
- `manutencao`
- `diretoria`

## Regras iniciais de acesso

- Usuarios autenticados podem consultar dados permitidos.
- Apenas perfis operacionais podem criar/editar registros.
- Apenas `admin` pode importar frota e gerenciar usuarios.
- `diretoria` deve ter acesso de leitura a dashboards e relatorios.

## Regras temporarias para desenvolvimento

Use estas regras apenas enquanto estivermos montando e validando a aplicacao. Elas exigem login para ler e gravar.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Depois da validacao inicial, trocar por regras com perfil por usuario.
