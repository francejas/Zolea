package com.zolea.backend.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.context.annotation.Configuration;

/**
 * La portada de la documentación de la API.
 *
 * <p>Lo que se escribe acá es lo primero que lee alguien que va a consumir esta API —en este
 * proyecto, el equipo que hace el frontend en Angular— así que dice las tres cosas que no se
 * deducen mirando la lista de endpoints: cómo se inicia sesión, qué forma tienen los errores y
 * quién puede hacer qué.
 *
 * <p><b>Los grupos no se declaran acá.</b> Cada controller ya trae su {@code @Tag} con nombre y
 * descripción, y declararlos también en esta portada no los pisa: los <b>duplica</b>. En Swagger
 * eso se ve como dos secciones con el mismo nombre, distinta descripción y la mitad de los
 * endpoints en cada una. Lo fija una prueba.
 */
@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "Zolea API",
        version = "2.0",
        description = """
            API del sistema de gestión de balnearios: reservas de carpas y sombrillas, cobro con \
            MercadoPago e ingreso con código QR.

            ## Cómo empezar

            1. `POST /api/auth/login` con un email y una contraseña devuelve un **token**, el id \
            del usuario y su **rol**.
            2. Ese token va en cada pedido en la cabecera `Authorization: Bearer <token>`. En esta \
            página, el botón **Authorize** de arriba a la derecha lo aplica a todo.
            3. El token **dura una hora**. Vencido, la API responde 401 y hay que iniciar sesión \
            otra vez.
            4. `GET /api/auth/me` dice quién es el dueño de un token. Sirve para recuperar la \
            sesión al recargar la página, sin abrir el token por dentro.

            Cuentas de la base de demostración, todas con la contraseña `admin123`: \
            `admin.mdp@zolea.com` (administrador) y `santi.rodriguez@gmail.com` (cliente).

            ## Cómo son los errores

            Todos los errores tienen la misma forma, así que se pueden manejar en un solo lugar:

            ```json
            {"error": "La unidad seleccionada ya está ocupada en ese rango de fechas."}
            ```

            Cuando el pedido trae datos inválidos, se agrega el detalle **por campo**, para poder \
            marcar el formulario:

            ```json
            {"error": "Hay datos inválidos en el pedido",
             "campos": {"email": "El email no tiene un formato válido"}}
            ```

            Qué significa cada código: **400** una regla rechazó el pedido · **401** falta el \
            token o venció · **403** tu tipo de cuenta no puede hacer esto · **404** no existe o \
            no es tuyo · \
            **409** el pedido era válido y dejó de serlo al guardar (dos peticiones simultáneas) · \
            **502** MercadoPago no respondió.

            ## Quién puede hacer qué

            Los endpoints marcados con candado necesitan token. Además, el **dueño** de un recurso \
            y un **administrador** ven cosas distintas: un cliente solo accede a sus propias \
            reservas, y cada administrador solo al balneario que gestiona. Pedir algo ajeno \
            devuelve **404, con el mismo texto que si no existiera**, para no revelar qué existe. \
            El **403** es para el tipo de cuenta equivocado: un cliente en un endpoint de \
            administrador, o el administrador de un balneario en algo de la cuenta de Zolea, \
            siempre con el mismo texto.

            Los cuatro endpoints de MercadoPago **no** llevan candado, y no es un olvido: los \
            llama la pasarela desde sus servidores, que no tiene token de la aplicación. Ninguno \
            confía en lo que le llega — los cuatro consultan el pago contra MercadoPago antes de \
            confirmar nada.
            """,
        contact = @Contact(
            name = "Zolea · UTN Programación 4",
            url = "https://github.com/francejas/Zolea"
        )
    ),
    servers = {
        @Server(url = "/", description = "El servidor desde el que se abrió esta página"),
        @Server(url = "http://localhost:8080", description = "Backend local")
    }
)
@SecurityScheme(
    name = "bearerAuth",
    type = SecuritySchemeType.HTTP,
    scheme = "bearer",
    bearerFormat = "JWT",
    description = "El token que devuelve POST /api/auth/login. Pegarlo solo, sin escribir «Bearer» adelante."
)
public class OpenApiConfig {
}
