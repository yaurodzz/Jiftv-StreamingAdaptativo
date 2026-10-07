"""Comandos de administração do Firebase Auth.

Uso (com os containers rodando):
  docker compose exec api python -m app.cli admin <email> [senha]
      Dá acesso ao painel (custom claim { admin: true }). Se o usuário não existir e uma
      senha for informada, ele é criado.
  docker compose exec api python -m app.cli remover-admin <email>
  docker compose exec api python -m app.cli listar
"""

import sys

from firebase_admin import auth

from . import fb


def tornar_admin(email, senha=None):
    try:
        usuario = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        if not senha:
            raise SystemExit(f"Usuário {email} não existe. Informe uma senha para criá-lo.") from None
        usuario = auth.create_user(email=email, password=senha, email_verified=True)
        print(f"Usuário {email} criado.")
    claims = dict(usuario.custom_claims or {})
    claims["admin"] = True
    auth.set_custom_user_claims(usuario.uid, claims)
    print(f"{email} agora é administrador do JIFTv. Se estiver logado, saia e entre de novo no painel.")


def remover_admin(email):
    usuario = auth.get_user_by_email(email)
    claims = dict(usuario.custom_claims or {})
    claims.pop("admin", None)
    auth.set_custom_user_claims(usuario.uid, claims)
    print(f"{email} não é mais administrador.")


def listar():
    for usuario in auth.list_users().iterate_all():
        papel = "admin" if (usuario.custom_claims or {}).get("admin") else "-"
        print(f"{papel:6} {usuario.email}")


def main(args):
    fb.iniciar()
    if len(args) >= 2 and args[0] == "admin":
        tornar_admin(args[1], args[2] if len(args) > 2 else None)
    elif len(args) == 2 and args[0] == "remover-admin":
        remover_admin(args[1])
    elif args[:1] == ["listar"]:
        listar()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
