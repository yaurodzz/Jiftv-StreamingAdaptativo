# Cloudinary — preset unsigned para foto de atleta

> **OBSOLETO desde 2026-10-12.** O cadastro público não envia mais foto: ela vem da API do site institucional
> pela matrícula ou é enviada pelo admin no painel, e nos dois casos quem grava no Cloudinary é o worker
> (`CLOUDINARY_URL` no `.env` do servidor), sem preset. O site não usa mais `VITE_CLOUDINARY_*`, e
> `POST /api/atletas` não aceita mais `photoUrl`. O preset `athletes_profile` pode ser apagado no Cloudinary.
> Veja [integracao-site-institucional.md](integracao-site-institucional.md). O texto abaixo fica só como histórico.

O cadastro público de atleta faz upload da foto **direto do navegador** para o Cloudinary,
sem passar pelo servidor da escola. Isso exige um *upload preset* do tipo **unsigned** configurado
para aceitar apenas imagens dentro de uma pasta dedicada.

## Preset a criar

No painel Cloudinary → **Settings → Upload → Add upload preset**:

| Campo                     | Valor                                     |
|---------------------------|-------------------------------------------|
| **Preset name**           | `athletes_profile`                        |
| **Signing Mode**          | `Unsigned`                                |
| **Folder**                | `jiftv/athletes/pending`                  |
| **Use filename**          | `false`                                   |
| **Unique filename**       | `true`                                    |
| **Overwrite**             | `false`                                   |
| **Access mode**           | `public`                                  |
| **Resource type**         | `image`                                   |
| **Allowed formats**       | `jpg,png,webp`                            |
| **Max file size**         | `2000000` (2 MB)                          |
| **Incoming transformation** | `c_limit,w_1200,h_1200,q_auto,f_auto`   |
| **Eager transformations** | `c_fill,g_face,w_512,h_512,r_max,q_auto` (avatar redondo) |

> A pasta `jiftv/athletes/pending` isola o material moderado. Ao aprovar,
> uma melhoria futura é mover a foto para `jiftv/athletes/approved` com `cloudinary.uploader.rename()`
> (ainda não implementado: a foto aprovada continua na pasta `pending`).

## Variáveis de ambiente no frontend

Em `web/.env` (modelo em `web/.env.example`):

```
VITE_CLOUDINARY_CLOUD_NAME=<seu cloud>
VITE_CLOUDINARY_UPLOAD_PRESET=athletes_profile
```

O frontend usa esses valores no `POST https://api.cloudinary.com/v1_1/<cloud>/image/upload`
com `FormData` — nunca precisa da API secret.

## Validação no servidor (worker)

O endpoint `POST /api/atletas` do worker (servidor de mídia) **exige** que `photoUrl` case com o padrão
`^https://res.cloudinary.com/<qualquer-cloud>/image/upload/…` para evitar hotlink /
SSRF. O tamanho e formato já são validados pelo próprio Cloudinary (preset).

## Rotação / abuso

- Limite por IP no worker (10 envios por minuto).
- Fotos rejeitadas ficam na pasta `pending` até serem apagadas via job manual — não é
  urgente porque não são indexadas (`athletes.status != "approved"` não passa pelas
  Firestore rules e não aparece na vitrine).
