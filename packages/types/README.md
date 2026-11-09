# @mcpromania/types

Scheme partajate pentru tenant, chei API, usage logs, răspunsul unificat al gateway-ului și contractele ANAF / BNR.

Admin Client (service_role) se folosește doar în workers. Gateway-ul folosește întotdeauna client scoped pe tenant_id.

Build-ul emite `dist/index.js` și `dist/index.d.ts` pentru import nativ în Node.js.
