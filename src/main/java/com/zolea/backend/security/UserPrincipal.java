package com.zolea.backend.security;

import com.zolea.backend.exceptions.auth.ZoleaAccountRequiredException;
import com.zolea.backend.models.Client;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * El usuario autenticado, con su {@code idClient}.
 *
 * <p>Antes se usaba el {@link org.springframework.security.core.userdetails.User} de Spring, que
 * solo transporta el email y los roles. Sin el id no había forma de responder «¿este recurso es
 * tuyo?», y de ahí salían todos los accesos indebidos: la única comprobación de pertenencia del
 * sistema comparaba cadenas de email, y las lecturas no comprobaban nada.
 *
 * <p>Con el id en el principal, la regla se escribe en una anotación sobre el endpoint:
 * {@code @PreAuthorize("hasRole('ADMIN') or #id == principal.idClient")}.
 */
public record UserPrincipal(
        Long idClient,
        String email,
        String passwordHash,
        String role,
        Long idManagedResort
) implements UserDetails {

    public static UserPrincipal de(Client client) {
        return new UserPrincipal(
                client.getIdClient(),
                client.getEmail(),
                client.getPasswordHash(),
                client.getRole(),
                client.getManagedResort() != null
                        ? client.getManagedResort().getIdResort()
                        : null
        );
    }

    /**
     * Getter explícito además del accesor del record.
     *
     * <p>Las expresiones de {@code @PreAuthorize} resuelven {@code principal.idClient} buscando un
     * getter con nombre JavaBean. Dejarlo escrito evita que la autorización dependa de si la
     * versión de SpEL en uso reconoce o no los accesores de un record: si no lo reconociera, la
     * expresión no fallaría en el arranque sino al evaluarse, y el efecto sería abrir el acceso.
     */
    public Long getIdClient() {
        return idClient;
    }

    /** Ver la nota de {@link #getIdClient()}: el getter explícito es lo que usa SpEL. */
    public Long getIdManagedResort() {
        return idManagedResort;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // El rol se guarda sin prefijo ("USER" / "ADMIN") y Spring lo espera con "ROLE_".
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }
    /**
     * El balneario que administra, exigido.
     *
     * <p>Un ADMIN sin balneario asignado es un estado inválido. Hasta acá ese dato faltante se
     * traducía en «ve todo el sistema», que es la peor lectura posible: el listado de reservas
     * devolvía las de los cinco balnearios y el de unidades, las cien. Ahora es un 403 que dice
     * qué pasó, en vez de una pantalla vacía o —peor— una llena de datos ajenos.
     *
     * <p>Puede ocurrir sin que nadie se equivoque programando: la asignación se deriva en el seed
     * con un {@code JOIN} entre el email del cliente y el {@code admin_email} del balneario, así
     * que un email que no coincide deja al administrador sin balneario y sin aviso.
     */
    public Long requireManagedResort() {
        if (idManagedResort == null) {
            throw new AccessDeniedException("El administrador no tiene un balneario asignado.");
        }
        return idManagedResort;
    }

    /**
     * Exige que sea la cuenta de Zolea: un administrador sin balneario asignado (15.7).
     *
     * <p>Esa cuenta hace dos cosas y nada más: carga el catálogo de servicios, que es uno solo para
     * todos los balnearios, y da de alta balnearios. No la vuelve «un administrador que ve todo»: el
     * panel le sigue respondiendo 403 por {@link #requireManagedResort()}. El rol ADMIN lo exige
     * antes el {@code @PreAuthorize} del endpoint, así que acá solo falta mirar el balneario.
     *
     * @param motivo lo que recibe en el 403 el administrador de un balneario
     */
    public void requireZoleaAccount(String motivo) {
        if (idManagedResort != null) {
            throw new ZoleaAccountRequiredException(motivo);
        }
    }

    /** Si es administrador. El rol sale de la base en cada pedido, no del contenido del token. */
    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
