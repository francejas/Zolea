package com.zolea.backend;

import com.zolea.backend.models.Client;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.security.JwtUtil;
import com.zolea.backend.security.UserPrincipal;
import com.zolea.backend.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El plano libre (GH-68): cada unidad guarda su casilla en la grilla del balneario (columna y fila,
 * desde 0) y el administrador guarda el plano entero de una vez. El identificador pasa a ser texto
 * libre, de hasta 20 caracteres, sin repetirse dentro del balneario.
 */
@AutoConfigureMockMvc
@DisplayName("Plano libre — cada balneario ubica sus unidades en una grilla")
class ResortPlanTest extends IntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtUtil jwtUtil;

    private Resort resort;
    private Client admin;
    private RentalUnit carpa;
    private RentalUnit sombrilla;
    private RentalUnit palmera;

    @BeforeEach
    void aResortWithThreeUnits() {
        resort = aResort();
        admin = anAdminOf(resort);
        carpa = aUnitIn(resort, 12000);
        sombrilla = aUnitIn(resort, 8000);
        palmera = aUnitIn(resort, 9000);
        syncWithDatabase();
    }

    @Test
    @DisplayName("guardar el plano ubica cada unidad en su casilla, y sin posición queda fuera")
    void savingThePlan_placesEachUnit() throws Exception {
        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[
                          {"idRentalUnit":%d,"posX":3,"posY":1},
                          {"idRentalUnit":%d,"posX":0,"posY":0},
                          {"idRentalUnit":%d,"posX":null,"posY":null}]}"""
                        .formatted(carpa.getIdRentalUnit(), sombrilla.getIdRentalUnit(), palmera.getIdRentalUnit())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.idRentalUnit == %d)].posX".formatted(carpa.getIdRentalUnit())).value(3))
                .andExpect(jsonPath("$[?(@.idRentalUnit == %d)].posY".formatted(carpa.getIdRentalUnit())).value(1));

        syncWithDatabase();
        assertThat(reload(carpa).getPosX()).isEqualTo(3);
        assertThat(reload(carpa).getPosY()).isEqualTo(1);
        assertThat(reload(sombrilla).getPosX()).isZero();
        assertThat(reload(sombrilla).getPosY()).isZero();
        assertThat(reload(palmera).getPosX()).isNull();
        assertThat(reload(palmera).getPosY()).isNull();
    }

    @Test
    @DisplayName("dos unidades se pueden cambiar de casilla entre sí en el mismo pedido")
    void twoUnitsCanSwapCells() throws Exception {
        place(carpa, 0, 0);
        place(sombrilla, 1, 0);
        syncWithDatabase();

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":1,"posY":0},{"idRentalUnit":%d,"posX":0,"posY":0}]}"""
                        .formatted(carpa.getIdRentalUnit(), sombrilla.getIdRentalUnit())))
                .andExpect(status().isOk());

        syncWithDatabase();
        assertThat(reload(carpa).getPosX()).isEqualTo(1);
        assertThat(reload(sombrilla).getPosX()).isZero();
    }

    @Test
    @DisplayName("dos unidades en la misma casilla: 400, y no se guarda nada")
    void twoUnitsInTheSameCell_isRejected() throws Exception {
        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":2,"posY":2},{"idRentalUnit":%d,"posX":2,"posY":2}]}"""
                        .formatted(carpa.getIdRentalUnit(), sombrilla.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("misma casilla")));

        syncWithDatabase();
        assertThat(reload(carpa).getPosX()).isNull();
        assertThat(reload(sombrilla).getPosX()).isNull();
    }

    @Test
    @DisplayName("una unidad que queda fuera del pedido conserva su casilla, y otra no se la puede pisar")
    void aUnitLeftOut_keepsItsCell() throws Exception {
        place(palmera, 4, 4);
        syncWithDatabase();

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":4,"posY":4}]}"""
                        .formatted(carpa.getIdRentalUnit())))
                .andExpect(status().isBadRequest());

        syncWithDatabase();
        assertThat(reload(palmera).getPosX()).isEqualTo(4);
        assertThat(reload(carpa).getPosX()).isNull();
    }

    @Test
    @DisplayName("una unidad de otro balneario: 400, y no se toca")
    void aUnitFromAnotherResort_isRejected() throws Exception {
        RentalUnit ajena = aUnitIn(aResort(), 5000);
        syncWithDatabase();

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":0,"posY":0},{"idRentalUnit":%d,"posX":1,"posY":0}]}"""
                        .formatted(carpa.getIdRentalUnit(), ajena.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("no es de tu balneario")));

        syncWithDatabase();
        assertThat(reload(ajena).getPosX()).isNull();
        assertThat(reload(carpa).getPosX()).isNull();
    }

    @Test
    @DisplayName("una posición fuera de la grilla de 40 × 40, o negativa: 400")
    void aPositionOutsideTheGrid_isRejected() throws Exception {
        for (String cell : new String[]{"\"posX\":40,\"posY\":0", "\"posX\":0,\"posY\":40", "\"posX\":-1,\"posY\":0"}) {
            mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                            {"units":[{"idRentalUnit":%d,%s}]}""".formatted(carpa.getIdRentalUnit(), cell)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error", containsString("40")));
        }

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":39,"posY":39}]}""".formatted(carpa.getIdRentalUnit())))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("la columna sin la fila, o la misma unidad dos veces: 400")
    void halfAPositionOrARepeatedUnit_isRejected() throws Exception {
        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":2,"posY":null}]}""".formatted(carpa.getIdRentalUnit())))
                .andExpect(status().isBadRequest());

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":0,"posY":0},{"idRentalUnit":%d,"posX":1,"posY":0}]}"""
                        .formatted(carpa.getIdRentalUnit(), carpa.getIdRentalUnit())))
                .andExpect(status().isBadRequest());

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, "{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("una unidad dada de baja no se ubica, y al darla de baja sale del plano")
    void aRetiredUnit_leavesThePlan() throws Exception {
        place(carpa, 1, 1);
        syncWithDatabase();

        mockMvc.perform(json(patch("/api/rental-units/" + carpa.getIdRentalUnit() + "/retire"), admin, ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.posX").isEmpty());

        syncWithDatabase();
        assertThat(reload(carpa).getPosX()).isNull();
        assertThat(reload(carpa).getPosY()).isNull();

        mockMvc.perform(json(put("/api/resorts/my/plan"), admin, """
                        {"units":[{"idRentalUnit":%d,"posX":1,"posY":1}]}""".formatted(carpa.getIdRentalUnit())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("dada de baja")));
    }

    @Test
    @DisplayName("la ficha pública y el listado del administrador traen la casilla de cada unidad")
    void unitsBringTheirCell() throws Exception {
        place(carpa, 5, 2);
        syncWithDatabase();

        mockMvc.perform(get("/api/resorts/" + resort.getIdResort()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rentalUnits[?(@.idRentalUnit == %d)].posX".formatted(carpa.getIdRentalUnit())).value(5))
                .andExpect(jsonPath("$.rentalUnits[?(@.idRentalUnit == %d)].posY".formatted(carpa.getIdRentalUnit())).value(2))
                .andExpect(jsonPath("$.rentalUnits[?(@.idRentalUnit == %d)].posX".formatted(palmera.getIdRentalUnit()))
                        .value(contains(nullValue())));

        mockMvc.perform(json(get("/api/rental-units"), admin, ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.idRentalUnit == %d)].posX".formatted(carpa.getIdRentalUnit())).value(5));
    }

    @Test
    @DisplayName("un cliente: 403; la cuenta de Zolea, sin balneario: 403; sin token: 401")
    void onlyTheAdminOfAResort() throws Exception {
        String body = """
                {"units":[{"idRentalUnit":%d,"posX":0,"posY":0}]}""".formatted(carpa.getIdRentalUnit());

        mockMvc.perform(json(put("/api/resorts/my/plan"), aClient(), body)).andExpect(status().isForbidden());
        mockMvc.perform(json(put("/api/resorts/my/plan"), theZoleaAccount(), body)).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/resorts/my/plan").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());

        syncWithDatabase();
        assertThat(reload(carpa).getPosX()).isNull();
    }

    // ---------------------------------------------------------------------
    // El identificador, texto libre
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("un identificador libre, como «Palmera 3», se puede usar")
    void aFreeIdentifier_isAccepted() throws Exception {
        mockMvc.perform(json(post("/api/rental-units"), admin, newUnit("Palmera 3", resort)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.identifier").value("Palmera 3"))
                .andExpect(jsonPath("$.posX").isEmpty());
    }

    @Test
    @DisplayName("un identificador de más de 20 caracteres: 400 en el campo")
    void anIdentifierLongerThan20_isRejected() throws Exception {
        mockMvc.perform(json(post("/api/rental-units"), admin, newUnit("Carpa del fondo número 12", resort)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.identifier").exists());

        mockMvc.perform(json(post("/api/rental-units"), admin, newUnit("Carpa del fondo 1234", resort)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("el mismo identificador en el mismo balneario: 400; en otro balneario se puede")
    void theSameIdentifier_onlyRepeatsInAnotherResort() throws Exception {
        mockMvc.perform(json(post("/api/rental-units"), admin, newUnit("Carpa 12", resort)))
                .andExpect(status().isCreated());
        mockMvc.perform(json(post("/api/rental-units"), admin, newUnit("carpa 12", resort)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", containsString("Ya existe una unidad")));

        Resort otro = aResort();
        Client adminDelOtro = anAdminOf(otro);
        syncWithDatabase();
        mockMvc.perform(json(post("/api/rental-units"), adminDelOtro, newUnit("Carpa 12", otro)))
                .andExpect(status().isCreated());
    }

    private String newUnit(String identifier, Resort in) {
        return """
                {"type":"TENT","identifier":"%s","dailyPrice":9000,"isBlocked":false,"resortId":%d}"""
                .formatted(identifier, in.getIdResort());
    }

    private void place(RentalUnit unit, int x, int y) {
        unit.setPosX(x);
        unit.setPosY(y);
        rentalUnitRepository.save(unit);
    }

    private RentalUnit reload(RentalUnit unit) {
        return rentalUnitRepository.findById(unit.getIdRentalUnit()).orElseThrow();
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, Client as, String body) {
        return request.contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .header("Authorization", "Bearer " + jwtUtil.generateToken(UserPrincipal.de(as)));
    }
}
