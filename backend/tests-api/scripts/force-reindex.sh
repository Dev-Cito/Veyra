#!/usr/bin/env bash
#
# Force l'épuisement de l'intervalle entre deux positions flottantes,
# jusqu'à déclencher la réindexation de la fratrie.
#
# Bruno exécute chaque requête une fois : impossible d'écrire une boucle
# dans la collection. Ce script comble ce trou.
#
# Usage :
#   ./force-reindex.sh <workspaceId> <listId> <anchorTaskId> <cookie>
#
# Le cookie se récupère dans Bruno, onglet Vars, variable aliceCookie.
# Exemple :
#   ./force-reindex.sh 7f3a... 2b91... c4e0... 'access_token=eyJhbG...'

set -euo pipefail

BASE="${BASE_URL:-http://localhost:3001}"
WS="${1:?workspaceId manquant}"
LIST="${2:?listId manquant}"
ANCHOR="${3:?anchorTaskId manquant}"
COOKIE="${4:?cookie manquant}"

echo "Création des tâches sonde…"
PROBE=$(curl -sS -X POST "$BASE/workspaces/$WS/lists/$LIST/tasks" \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"title":"probe"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

echo "Sonde : $PROBE"
echo "Insertions répétées au même point…"

for i in $(seq 1 60); do
  RESP=$(curl -sS -X PATCH "$BASE/workspaces/$WS/tasks/$PROBE/move" \
    -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
    -d "{\"targetListId\":\"$LIST\",\"previousTaskId\":null,\"nextTaskId\":\"$ANCHOR\"}")

  POS=$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("position"))')
  REIDX=$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("reindexed"))')

  printf 'itération %2d  position=%-24s reindexed=%s\n' "$i" "$POS" "$REIDX"

  if [ "$REIDX" = "True" ] || [ "$REIDX" = "true" ]; then
    echo
    echo "Réindexation déclenchée à l'itération $i."
    echo "Vérifie maintenant que l'ordre relatif est IDENTIQUE et que les"
    echo "positions sont réespacées de 1000 :"
    echo
    echo "  curl -sS '$BASE/workspaces/$WS/boards/<boardId>/full' \\"
    echo "    -H 'Cookie: $COOKIE' | python3 -m json.tool"
    exit 0
  fi
done

echo
echo "Pas de réindexation après 60 itérations."
echo "L'ancrage se fait sur le voisin RÉELLEMENT adjacent : si une autre"
echo "tâche s'est glissée entre la sonde et l'ancre, l'intervalle se"
echo "réinitialise à chaque tour. Utilise une liste ne contenant que la"
echo "sonde et l'ancre."
