package com.zolea.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.zolea.backend.support.IntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * La API declara qué devuelve, no solo qué recibe.
 *
 * <p>Ocho endpoints armaban su respuesta a mano con un {@code Map.of(...)} y se declaraban como
 * {@code ResponseEntity<?>}. Funciona —el JSON sale bien— pero la documentación que el proyecto
 * publica en {@code /v3/api-docs} los describe como «un objeto», sin decir qué campos trae. Y de
 * esa documentación es de donde un frontend genera sus tipos: con un objeto vacío, el que consume
 * la API tiene que adivinar los nombres de los campos y enterarse de una equivocación recién en
 * tiempo de ejecución.
 *
 * <p>Estas pruebas miran <b>la documentación generada</b>, no la respuesta. Es la diferencia que
 * importa: el JSON ya era correcto antes; lo que faltaba era que estuviera declarado.
 */
@AutoConfigureMockMvc
@DisplayName("Contrato de salida — la API declara qué devuelve")
class ResponseContractTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper json = new ObjectMapper();

    /**
     * Los campos que la documentación declara para la respuesta exitosa de un endpoint.
     *
     * <p>Sigue el {@code $ref} hasta el componente, que es donde springdoc pone las propiedades
     * cuando la respuesta tiene un tipo con nombre. Si el endpoint devuelve un objeto sin declarar
     * —que es lo que produce {@code ResponseEntity<?>}— la lista vuelve vacía.
     */
    /** La documentación que publica la aplicación, tal como la lee un generador de clientes. */
    private JsonNode apiDocs() throws Exception {
        return json.readTree(mockMvc.perform(get("/v3/api-docs"))
                .andReturn().getResponse().getContentAsString());
    }

    private List<String> declaredFieldsOf(String path, String method, String status) throws Exception {
        JsonNode docs = apiDocs();

        JsonNode response = docs.path("paths").path(path).path(method).path("responses").path(status);
        JsonNode content = response.path("content");
        if (content.isMissingNode() || !content.fieldNames().hasNext()) {
            return List.of();
        }
        JsonNode schema = content.elements().next().path("schema");

        if (schema.hasNonNull("$ref")) {
            String component = schema.get("$ref").asText().substring("#/components/schemas/".length());
            schema = docs.path("components").path("schemas").path(component);
        }

        List<String> fields = new ArrayList<>();
        schema.path("properties").fieldNames().forEachRemaining(fields::add);
        return fields;
    }

    // ---------------------------------------------------------------------

    @Test
    @DisplayName("crear una reserva declara la reserva y la dirección de pago")
    void createBooking_declaresItsFields() throws Exception {
        assertThat(declaredFieldsOf("/api/bookings", "post", "201"))
                .contains("booking", "paymentUrl");
    }

    @Test
    @DisplayName("reintentar el pago declara la dirección de pago")
    void retryPayment_declaresItsFields() throws Exception {
        assertThat(declaredFieldsOf("/api/bookings/{id}/pay", "post", "200"))
                .contains("paymentUrl");
    }

    @Test
    @DisplayName("la reserva de mostrador declara el mensaje y la reserva")
    void walkInBooking_declaresItsFields() throws Exception {
        assertThat(declaredFieldsOf("/api/bookings/walkin", "post", "201"))
                .contains("message", "booking");
    }

    /**
     * Los seis que no documentan errores, porque no los tienen.
     *
     * <p>Los dos listados públicos no reciben ni parámetros ni token: devuelven la lista, vacía si
     * no hay nada. Los tres retornos de MercadoPago siempre redirigen —cuando el pago no se puede
     * comprobar, el cliente va a «pendiente», que no es un error— y el aviso automático siempre
     * responde 200 a propósito: un código de error solo lograría que MercadoPago reintente.
     *
     * <p>La lista está acá escrita a mano y no como una regla general porque es lo que la hace
     * útil: si mañana uno de estos empieza a poder fallar, hay que sacarlo de la lista, y eso
     * obliga a pensarlo.
     */
    private static final List<String> SIN_ERRORES_POSIBLES = List.of(
            "GET /api/resorts",
            "GET /api/amenities",
            "GET /api/bookings/success",
            "GET /api/bookings/pending",
            "GET /api/bookings/failure",
            "POST /api/bookings/notifications");

    @Test
    @DisplayName("todos los endpoints documentan qué puede salir mal")
    void everyEndpoint_documentsItsErrors() throws Exception {
        List<String> sinErrores = new ArrayList<>();

        JsonNode paths = apiDocs().path("paths");
        paths.fieldNames().forEachRemaining(path -> {
            JsonNode operations = paths.path(path);
            operations.fieldNames().forEachRemaining(method -> {
                JsonNode responses = operations.path(method).path("responses");
                boolean documentaAlgunError = false;
                for (var codes = responses.fieldNames(); codes.hasNext(); ) {
                    if (Integer.parseInt(codes.next()) >= 400) {
                        documentaAlgunError = true;
                    }
                }
                String operacion = method.toUpperCase() + " " + path;
                if (!documentaAlgunError && !SIN_ERRORES_POSIBLES.contains(operacion)) {
                    sinErrores.add(operacion);
                }
            });
        });

        assertThat(sinErrores)
                .withFailMessage("estos endpoints no dicen qué puede salir mal: %s", sinErrores)
                .isEmpty();
    }

    @Test
    @DisplayName("cada grupo de endpoints aparece una sola vez")
    void tags_areNotDuplicated() throws Exception {
        // Declarar un grupo en dos lados —la portada y el controller— no lo pisa: lo duplica. En
        // Swagger se ve como dos secciones con el mismo nombre y distinta descripción, y la mitad
        // de los endpoints en cada una.
        List<String> nombres = new ArrayList<>();
        apiDocs().path("tags").forEach(tag -> nombres.add(tag.path("name").asText()));

        assertThat(nombres)
                .withFailMessage("hay grupos repetidos en la documentación: %s", nombres)
                .doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("los pedidos traen un ejemplo listo para probar")
    void requestBodies_carryAnExample() throws Exception {
        // Sin ejemplos, probar un endpoint desde Swagger empieza por inventarse un cuerpo entero:
        // qué formato tiene la fecha, si el DNI va con puntos, qué es un identificador de unidad.
        // Con ellos, «Try it out» sale andando y de paso el ejemplo documenta el formato.
        List<String> pedidos = List.of(
                "BookingRequest", "ClientRequest", "AuthRequest",
                "ResortRequest", "RentalUnitRequest", "AmenityRequest", "ReviewRequest");

        JsonNode schemas = apiDocs().path("components").path("schemas");
        List<String> sinEjemplo = new ArrayList<>();

        for (String pedido : pedidos) {
            JsonNode properties = schemas.path(pedido).path("properties");
            boolean algunoTieneEjemplo = false;
            for (var campos = properties.elements(); campos.hasNext(); ) {
                if (campos.next().has("example")) {
                    algunoTieneEjemplo = true;
                }
            }
            if (!algunoTieneEjemplo) {
                sinEjemplo.add(pedido);
            }
        }

        assertThat(sinEjemplo)
                .withFailMessage("estos pedidos no traen ningún ejemplo: %s", sinEjemplo)
                .isEmpty();
    }

    @Test
    @DisplayName("los endpoints públicos no aparecen como si necesitaran token")
    void publicEndpoints_doNotAskForAToken() throws Exception {
        // Los cuatro de MercadoPago son el caso que importa: los llama la pasarela, que no tiene
        // token de la aplicación. Si la documentación dice que hace falta uno, el que prueba desde
        // Swagger concluye que están rotos — o peor, que el cobro exige autenticación y no la tiene.
        Map<String, String> publicos = Map.of(
                "/api/bookings/success", "get",
                "/api/bookings/pending", "get",
                "/api/bookings/failure", "get",
                "/api/bookings/notifications", "post",
                "/api/auth/login", "post",
                "/api/resorts/{id}/reviews", "get");

        List<String> conCandado = new ArrayList<>();
        for (var entrada : publicos.entrySet()) {
            JsonNode operation = apiDocs().path("paths").path(entrada.getKey()).path(entrada.getValue());
            if (operation.has("security")) {
                conCandado.add(entrada.getValue().toUpperCase() + " " + entrada.getKey());
            }
        }

        assertThat(conCandado)
                .withFailMessage("son públicos pero la documentación les pone candado: %s", conCandado)
                .isEmpty();
    }

    @Test
    @DisplayName("las cinco operaciones de balneario declaran el mensaje y el balneario")
    void resortOperations_declareTheirFields() throws Exception {
        record Operation(String path, String method, String status) {}

        List<Operation> operations = List.of(
                new Operation("/api/resorts", "post", "201"),
                new Operation("/api/resorts/my", "put", "200"),
                new Operation("/api/resorts/{id}", "put", "200"),
                new Operation("/api/resorts/{id}/inactive", "put", "200"),
                new Operation("/api/resorts/{id}/active", "put", "200"));

        for (Operation operation : operations) {
            assertThat(declaredFieldsOf(operation.path(), operation.method(), operation.status()))
                    .withFailMessage("%s %s no declara qué devuelve", operation.method(), operation.path())
                    .contains("message", "resort");
        }
    }
}
