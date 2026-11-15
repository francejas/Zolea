package com.zolea.backend.services;

import com.zolea.backend.dtos.booking.BookingSummaryResponse;
import com.zolea.backend.dtos.client.ClientRequest;
import com.zolea.backend.dtos.client.ClientResponse;
import com.zolea.backend.dtos.client.ResortClientResponse;
import com.zolea.backend.exceptions.client.ClientDataTakenException;
import com.zolea.backend.exceptions.client.ClientInvalidRegisterException;
import com.zolea.backend.exceptions.client.ClientNotFoundException;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Status;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.ClientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * <p><b>Transacciones:</b> la clase entera es de solo lectura y cada método que escribe lo declara.
 * Antes no había ninguna transacción declarada acá: el mapeo a DTO recorría colecciones LAZY fuera
 * de toda transacción y funcionaba únicamente porque {@code spring.jpa.open-in-view} dejaba la
 * sesión de base abierta durante toda la petición. Es decir, la transacción existía pero no la
 * había decidido nadie, y su límite lo ponía un filtro web.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ClientService {

    private final ClientRepository clientRepository;
    private final BookingRepository bookingRepository;
    private final PasswordEncoder passwordEncoder;

    public List<ClientResponse> getAll() {
        return clientRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .toList();
    }

    public ClientResponse getClientById(Long id) {
        Client client = clientRepository.findById(id)
                .orElseThrow(() -> new ClientNotFoundException("Client with id " + id + " not found"));

        return mapToResponse(client);
    }

    @Transactional
    public ClientResponse registerClient(ClientRequest request) {
        if (clientRepository.findByEmail(request.email()).isPresent()) {
            throw new ClientInvalidRegisterException("El email ya está registrado");
        }
        if (clientRepository.findByPhone(request.phone()).isPresent()) {
            throw new ClientInvalidRegisterException("El número de teléfono ya está registrado");
        }
        if (request.dni() != null && clientRepository.findByDni(request.dni()).isPresent()) {
            throw new ClientInvalidRegisterException("El DNI ya está registrado");
        }

        // La contraseña no la puede exigir el DTO: el mismo objeto sirve para actualizar el perfil,
        // donde venir vacía significa "no la cambies". Al registrarse sí es obligatoria.
        if (request.password() == null || request.password().isBlank()) {
            throw new ClientInvalidRegisterException("La contraseña es obligatoria");
        }

        Client client = new Client();
        client.setFirstName(request.firstName());
        client.setLastName(request.lastName());
        client.setEmail(request.email());
        client.setPasswordHash(passwordEncoder.encode(request.password()));
        client.setPhone(request.phone());
        client.setDni(request.dni());

        return mapToResponse(clientRepository.save(client));
    }

    @Transactional
    public ClientResponse updateClient(Long id, ClientRequest request) {
        Client saved = clientRepository.findById(id)
                .orElseThrow(() -> new ClientNotFoundException("Client with id " + id + " not found"));

        // Antes de guardar: si no, lo frena la restricción única de la base, con un 409 que no dice
        // cuál de los tres datos es el repetido.
        rejectIfTaken(clientRepository.findByEmail(request.email()), id, "email", "Ya hay otra cuenta con ese email.");
        rejectIfTaken(clientRepository.findByPhone(request.phone()), id, "phone", "Ya hay otra cuenta con ese teléfono.");
        if (request.dni() != null && !request.dni().isBlank()) {
            rejectIfTaken(clientRepository.findByDni(request.dni()), id, "dni", "Ya hay otra cuenta con ese DNI.");
        }

        // Si dos personas guardan el mismo dato a la vez, la restricción única de la base devuelve
        // un 409 genérico, sin el campo.
        saved.setFirstName(request.firstName());
        saved.setLastName(request.lastName());
        saved.setEmail(request.email());
        if (request.password() != null && !request.password().isBlank()) {
            saved.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        saved.setPhone(request.phone());
        if (request.dni() != null && !request.dni().isBlank()) {
            saved.setDni(request.dni());
        }

        return mapToResponse(clientRepository.save(saved));
    }

    /** El dato es de otra cuenta (no de la que se está editando): 409 con el campo. */
    private static void rejectIfTaken(Optional<Client> owner, Long id, String field, String message) {
        if (owner.isPresent() && !owner.get().getIdClient().equals(id)) {
            throw new ClientDataTakenException(field, message);
        }
    }

    /**
     * Los clientes del balneario que administra un ADMIN, con su historial <b>en ese balneario</b>.
     *
     * <p>No consulta clientes: consulta las <b>reservas del balneario</b> y las agrupa por titular.
     * Es lo que hace que el historial salga acotado por construcción — las reservas que se agrupan
     * son, por definición, las de ese balneario— en lugar de depender de que alguien se acuerde de
     * filtrarlas después.
     *
     * <p>Un titular puede no tener cuenta: la reserva de mostrador guarda el nombre y el DNI en la
     * propia reserva. Quién es el titular lo decide {@link Booking#isWalkIn()}, la misma regla con
     * la que se emite el código QR. Como efecto, la cuenta comodín «Cliente Mostrador» del seed no
     * aparece nunca en el listado: toda reserva que la apunta trae además su nombre de mostrador.
     */
    public List<ResortClientResponse> getClientsOfResort(Long idResort) {
        Map<String, List<Booking>> porTitular = bookingRepository.findByResortId(idResort).stream()
                .filter(b -> b.isWalkIn() || b.getClient() != null)
                .collect(Collectors.groupingBy(
                        ClientService::holderKey, LinkedHashMap::new, Collectors.toList()));

        return porTitular.values().stream()
                .map(ClientService::toResortClient)
                .toList();
    }

    /** Agrupa por persona: la cuenta si la hay, y si no el DNI con el que vino al mostrador. */
    private static String holderKey(Booking booking) {
        if (booking.isWalkIn()) {
            String dni = booking.getWalkInDni();
            return "mostrador:" + (dni != null && !dni.isBlank() ? dni : booking.getWalkInName());
        }
        return "cuenta:" + booking.getClient().getIdClient();
    }

    private static ResortClientResponse toResortClient(List<Booking> bookings) {
        Booking primera = bookings.get(0);

        BigDecimal gastado = bookings.stream()
                .map(ClientService::amountKeptByResort)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<BookingSummaryResponse> historial = bookings.stream()
                .map(ClientService::toSummary)
                .toList();

        if (primera.isWalkIn()) {
            return new ResortClientResponse(
                    null, primera.getWalkInName(), primera.getWalkInDni(), null, null,
                    true, bookings.size(), gastado, historial);
        }

        Client titular = primera.getClient();
        return new ResortClientResponse(
                titular.getIdClient(),
                titular.getFirstName() + " " + titular.getLastName(),
                titular.getDni(),
                titular.getEmail(),
                titular.getPhone(),
                false, bookings.size(), gastado, historial);
    }

    private static BigDecimal amountKeptByResort(Booking booking) {
        BigDecimal total = booking.getTotalPrice();
        if (total == null) {
            return BigDecimal.ZERO;
        }
        if (booking.getStatus() == Status.CONFIRMED) {
            return total;
        }
        if (booking.getStatus() == Status.CANCELED && booking.getRefundAmount() != null) {
            return total.subtract(booking.getRefundAmount());
        }
        return BigDecimal.ZERO;
    }

    private static BookingSummaryResponse toSummary(Booking booking) {
        return new BookingSummaryResponse(
                booking.getId(),
                booking.getStartDate(),
                booking.getEndDate(),
                booking.getTotalPrice(),
                booking.getStatus().name(),
                booking.getRentalUnit().getIdentifier());
    }

    private ClientResponse mapToResponse(Client client) {

        List<BookingSummaryResponse> bookingSummaries = (client.getBookings() == null) ? List.of() :
                client.getBookings().stream()
                        .map(ClientService::toSummary)
                        .toList();

        return new ClientResponse(
                client.getIdClient(),
                client.getFirstName(),
                client.getLastName(),
                client.getEmail(),
                client.getPhone(),
                client.getDni(),
                bookingSummaries
        );
    }
}
