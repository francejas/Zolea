package com.zolea.backend.services;

import com.zolea.backend.dtos.account.AccountPageResponse;
import com.zolea.backend.dtos.account.AccountResponse;
import com.zolea.backend.dtos.account.AccountSummaryResponse;
import com.zolea.backend.dtos.account.AccountType;
import com.zolea.backend.exceptions.client.AccountActionException;
import com.zolea.backend.exceptions.client.ClientNotFoundException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Client;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.ClientRepository;
import com.zolea.backend.repositories.ResortRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * Los usuarios de la plataforma, desde la cuenta de Zolea (#72). Que quien pide sea la cuenta de
 * Zolea lo mira el controlador; acá van las reglas de cada acción.
 *
 * <p>Las cuentas no se borran: tienen reservas e historial. Se desactivan.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccountService {

    static final int MAX_PAGE_SIZE = 100;

    private final ClientRepository clientRepository;
    private final ResortRepository resortRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Una página de cuentas, ordenadas por apellido y nombre.
     *
     * @param query lo que se escribió en el buscador: parte del nombre, del email o del DNI.
     * @param type el tipo de cuenta, o null para todas.
     */
    public AccountPageResponse search(String query, AccountType type, int page, int size) {
        PageRequest pageRequest = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE),
                Sort.by("lastName", "firstName", "idClient"));
        return AccountPageResponse.of(clientRepository
                .searchAccounts(searchPattern(query), type == null ? null : type.name(), pageRequest)
                .map(AccountSummaryResponse::of));
    }

    /** En minúsculas y entre {@code %}. Un DNI escrito con puntos se busca sin ellos. */
    private static String searchPattern(String query) {
        if (query == null || query.isBlank()) return null;
        String text = query.trim().toLowerCase(Locale.ROOT);
        if (text.matches("[\\d.]+")) text = text.replace(".", "");
        return "%" + text + "%";
    }

    public AccountResponse getAccount(Long id) {
        return AccountResponse.of(find(id));
    }

    /** Desactivada, no ingresa y su token deja de valer en el pedido siguiente. */
    @Transactional
    public AccountResponse deactivate(Long id, Long idZoleaAccount) {
        if (id.equals(idZoleaAccount)) {
            throw new AccountActionException("No podés desactivar tu propia cuenta.");
        }
        Client client = find(id);
        client.setActive(false);
        return AccountResponse.of(clientRepository.save(client));
    }

    @Transactional
    public AccountResponse activate(Long id) {
        Client client = find(id);
        client.setActive(true);
        return AccountResponse.of(clientRepository.save(client));
    }

    /** La reemplaza: la persona ingresa con esta y la cambia en Mi cuenta. */
    @Transactional
    public void setTemporaryPassword(Long id, String password) {
        Client client = find(id);
        client.setPasswordHash(passwordEncoder.encode(password));
        clientRepository.save(client);
    }

    /**
     * La hace administradora de un balneario: rol ADMIN y ese balneario. Si ya administraba otro,
     * pasa a este. El {@code adminEmail} del balneario no se toca: es el de quien ya lo llevaba.
     */
    @Transactional
    public AccountResponse assignResort(Long id, Long idResort, Long idZoleaAccount) {
        if (id.equals(idZoleaAccount)) {
            throw new AccountActionException("No podés cambiar el rol de tu propia cuenta.");
        }
        Client client = find(id);
        Resort resort = resortRepository.findById(idResort)
                .orElseThrow(() -> ResortNotFoundException.withId(idResort));
        client.setRole("ADMIN");
        client.setManagedResort(resort);
        return AccountResponse.of(clientRepository.save(client));
    }

    /**
     * Le quita el balneario y la vuelve cliente. No queda como ADMIN sin balneario: eso es la cuenta
     * de Zolea.
     */
    @Transactional
    public AccountResponse removeResort(Long id, Long idZoleaAccount) {
        if (id.equals(idZoleaAccount)) {
            throw new AccountActionException("No podés cambiar el rol de tu propia cuenta.");
        }
        Client client = find(id);
        if (client.getManagedResort() == null) {
            throw new AccountActionException("Esta cuenta no administra ningún balneario.");
        }
        client.setManagedResort(null);
        client.setRole("USER");
        return AccountResponse.of(clientRepository.save(client));
    }

    private Client find(Long id) {
        return clientRepository.findById(id).orElseThrow(() -> ClientNotFoundException.withId(id));
    }
}
