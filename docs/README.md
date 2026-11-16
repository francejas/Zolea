# Documentación técnica

| Documento | Qué contiene |
|---|---|
| [modelo-de-datos.md](modelo-de-datos.md) | Diagrama de clases, diagrama entidad-relación y las restricciones de unicidad que hace cumplir la base |
| [decisiones.md](decisiones.md) | Las dieciocho decisiones de arquitectura, cada una con el problema que resolvía y lo que se paga por ella |
| [flujo-de-pago.md](flujo-de-pago.md) | Cómo se cobra una reserva, los dos caminos de confirmación y por qué son dos |
| [guia-frontend.md](guia-frontend.md) | Para quien consume la API: sesión, errores, permisos, los flujos completos y cómo generar el cliente de TypeScript |

El [README del proyecto](../README.md) tiene la puesta en marcha, las variables de entorno y
el listado de endpoints.

## Cómo se verificó lo que dice acá

Los diagramas no están dibujados de memoria: las tablas y las restricciones se leyeron de la
base con `SHOW CREATE TABLE` después de arrancar la aplicación, y los métodos que aparecen en
el diagrama de clases son los que existen en el código.

Las decisiones que hablan de una garantía —el candado de la doble reserva, la unicidad del
pago— tienen una prueba automática que falla si esa garantía desaparece.
