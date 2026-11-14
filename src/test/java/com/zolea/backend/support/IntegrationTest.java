package com.zolea.backend.support;

import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.models.Status;
import com.zolea.backend.models.UnitType;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.ClientRepository;
import com.zolea.backend.repositories.GuestRepository;
import com.zolea.backend.repositories.RentalUnitRepository;
import com.zolea.backend.repositories.ResortRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Base de las pruebas de integración.
 *
 * <p>Levantan el contexto completo de Spring contra el mismo MySQL de docker-compose que se usa
 * para probar la aplicación a mano, pero sobre el schema {@code zolea_test}, así los datos de
 * demostración quedan intactos. El esquema se recrea en cada corrida y los datos de demostración
 * no se cargan: cada prueba arma la situación que necesita, que es lo que la hace legible sin
 * tener que ir a mirar el seed.
 *
 * <p><b>Requisito:</b> {@code docker compose up -d db} tiene que estar corriendo.
 *
 * <p>Cada prueba corre dentro de una transacción que se revierte al terminar, así que ninguna deja
 * residuos para la siguiente.
 *
 * <p>Los nombres de los métodos de prueba van en español porque describen el comportamiento
 * esperado del dominio y se leen como oraciones; el resto del código mantiene los identificadores
 * en inglés, como el resto del proyecto.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
public abstract class IntegrationTest {

    /** Evita chocar con los índices únicos de email, DNI y adminEmail entre pruebas. */
    private static final AtomicInteger SEQ = new AtomicInteger(1000);

    @Autowired protected ClientRepository clientRepository;
    @Autowired protected ResortRepository resortRepository;
    @Autowired protected RentalUnitRepository rentalUnitRepository;
    @Autowired protected BookingRepository bookingRepository;
    @Autowired protected GuestRepository guestRepository;

    /** El mismo reloj que usa la aplicación, anclado a la zona del balneario. */
    @Autowired protected Clock clock;

    @PersistenceContext protected EntityManager entityManager;

    /**
     * Vuelca lo pendiente a la base y vacía el contexto de persistencia.
     *
     * <p>Hace falta antes de pedir algo por HTTP dentro de una prueba. Las entidades que arman las
     * fixtures quedan en el contexto con sus colecciones inversas sin poblar —un {@code Booking}
     * recién creado tiene {@code guests} en null aunque ya se hayan guardado los huéspedes, porque
     * el lado inverso de una relación no se mantiene solo—, y el endpoint recibiría esas mismas
     * instancias a medio armar en lugar de leer de la base.
     *
     * <p>Vaciando el contexto, la petición carga las entidades de cero, que es exactamente lo que
     * pasa en una petición real.
     */
    protected void syncWithDatabase() {
        entityManager.flush();
        entityManager.clear();
    }

    protected LocalDate today() {
        return LocalDate.now(clock);
    }

    protected LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    // ---------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------

    protected Client aClient() {
        int n = SEQ.incrementAndGet();
        Client client = new Client();
        client.setFirstName("Cliente");
        client.setLastName("Numero" + n);
        client.setEmail("cliente" + n + "@test.zolea");
        client.setPasswordHash("$2b$10$hash.de.prueba.no.se.verifica.nunca.aaaaaaaaaaaaaaaaaaaaaa");
        client.setPhone("11" + n + "0000");
        client.setDni("40" + n + "00");
        client.setRole("USER");
        return clientRepository.save(client);
    }

    /** Un cliente con rol ADMIN, sin balneario asignado. */
    protected Client anAdmin() {
        Client admin = aClient();
        admin.setRole("ADMIN");
        return clientRepository.save(admin);
    }

    /**
     * La cuenta de Zolea: un administrador sin balneario. Es la única que administra el catálogo de
     * servicios (15.7); del panel de un balneario no ve nada.
     */
    protected Client theZoleaAccount() {
        return anAdmin();
    }

    /** El administrador de un balneario concreto: es lo que acota lo que ve y lo que puede tocar. */
    protected Client anAdminOf(Resort resort) {
        Client admin = aClient();
        admin.setRole("ADMIN");
        admin.setManagedResort(resort);
        return clientRepository.save(admin);
    }

    protected Resort aResort() {
        int n = SEQ.incrementAndGet();
        Resort resort = new Resort();
        resort.setName("Balneario de prueba " + n);
        resort.setLocation("Mar del Plata");
        resort.setAdminEmail("admin" + n + "@test.zolea");
        resort.setActive(true);
        return resortRepository.save(resort);
    }

    /** Una unidad libre, con el precio diario indicado, en un balneario nuevo. */
    protected RentalUnit aUnit(double dailyPrice) {
        return aUnit(BigDecimal.valueOf(dailyPrice));
    }

    /** Igual, para las pruebas que necesitan un precio con centavos exactos. */
    protected RentalUnit aUnit(BigDecimal dailyPrice) {
        return aUnitIn(aResort(), dailyPrice);
    }

    /** Una unidad libre en un balneario concreto, para las pruebas que comparan entre balnearios. */
    protected RentalUnit aUnitIn(Resort resort, double dailyPrice) {
        return aUnitIn(resort, BigDecimal.valueOf(dailyPrice));
    }

    protected RentalUnit aUnitIn(Resort resort, BigDecimal dailyPrice) {
        RentalUnit unit = new RentalUnit();
        unit.setType(UnitType.UMBRELLA);
        unit.setIdentifier("A-" + SEQ.incrementAndGet());
        unit.setDailyPrice(dailyPrice);
        unit.setIsBlocked(false);
        unit.setResort(resort);
        return rentalUnitRepository.save(unit);
    }

    /**
     * Una reserva persistida directamente, sin pasar por el servicio. Se usa cuando la prueba
     * necesita un estado que el servicio no puede producir (una reserva vieja, una sin huéspedes,
     * una ya cancelada).
     */
    protected Booking aBooking(Client client, RentalUnit unit, LocalDate startDate,
                               LocalDate endDate, Status status, LocalDateTime createdAt) {
        Booking booking = new Booking();
        booking.setClient(client);
        booking.setRentalUnit(unit);
        booking.setStartDate(startDate);
        booking.setEndDate(endDate);
        booking.setStatus(status);
        booking.setCreatedAt(createdAt);
        booking.setTotalPrice(BigDecimal.ZERO);
        return bookingRepository.save(booking);
    }

    /**
     * Un huésped con QR sin usar, asociado a la reserva.
     *
     * <p>Usa {@code Booking.agregarHuesped}, el mismo punto único que usa la aplicación, así la
     * reserva queda con los dos lados de la relación coherentes.
     */
    protected Guest aGuest(Booking booking, String fullName, String dni) {
        return guestRepository.save(booking.addGuest(fullName, dni));
    }
}
