import type {
  Contact,
  ContactType,
  ContactStatus,
  IdentifierType,
  PaginatedResult,
} from '../types/central.types'
import type { ContactRepository, SearchContactsInput } from '../repositories/contact.repository'
import type { AuditRepository } from '../repositories/audit.repository'
import { ContactNotFoundError } from '../types/errors.types'

// ============================================================================
// ContactService
//
// Orquestra CRUD de contatos.
// Regras:
//   1. org mismatch retorna ContactNotFoundError (nunca vaza existência cross-org).
//   2. audit.insert() é fire-and-forget (void) — falha não bloqueia o fluxo.
//   3. Identificadores são upsertados em série após criação do contato.
// ============================================================================

export interface CreateContactInput {
  name?:         string
  displayPhone?: string
  displayEmail?: string
  contactType?:  ContactType
  source?:       string
  identifiers?:  { type: IdentifierType; value: string; isPrimary?: boolean }[]
}

export interface UpdateContactInput {
  name?:         string
  displayPhone?: string
  displayEmail?: string
  contactType?:  ContactType
  status?:       ContactStatus
}

export type SearchContactsParams = SearchContactsInput

export class ContactService {
  constructor(
    private readonly contact: ContactRepository,
    private readonly audit:   AuditRepository,
  ) {}

  async search(params: SearchContactsParams): Promise<PaginatedResult<Contact>> {
    return this.contact.search(params)
  }

  async create(orgId: string, input: CreateContactInput, actorId: string): Promise<Contact> {
    const contact = await this.contact.create({
      organization_id: orgId,
      name:            input.name,
      display_phone:   input.displayPhone,
      display_email:   input.displayEmail,
      contact_type:    input.contactType ?? 'other',
      source:          input.source,
      is_provisional:  false,
    })

    if (input.identifiers?.length) {
      for (const ident of input.identifiers) {
        await this.contact.upsertIdentifier({
          organization_id:  orgId,
          contact_id:       contact.id,
          identifier_type:  ident.type,
          identifier_value: ident.value,
          is_primary:       ident.isPrimary ?? false,
        })
      }
    }

    void this.audit.insert({
      organization_id: orgId,
      event_type:      'contact.created',
      performed_by:    actorId,
      payload:         { contactId: contact.id, source: input.source ?? null },
    })

    return contact
  }

  async getById(orgId: string, id: string): Promise<Contact> {
    const contact = await this.contact.findById(id)
    if (!contact || contact.organization_id !== orgId) {
      throw new ContactNotFoundError(id)
    }
    return contact
  }

  async update(orgId: string, id: string, input: UpdateContactInput, actorId: string): Promise<Contact> {
    const existing = await this.contact.findById(id)
    if (!existing || existing.organization_id !== orgId) {
      throw new ContactNotFoundError(id)
    }

    const updated = await this.contact.update(id, {
      name:          input.name,
      display_phone: input.displayPhone,
      display_email: input.displayEmail,
      contact_type:  input.contactType,
      status:        input.status,
    })

    void this.audit.insert({
      organization_id: orgId,
      event_type:      'contact.updated',
      performed_by:    actorId,
      payload:         { contactId: id },
    })

    return updated
  }
}
