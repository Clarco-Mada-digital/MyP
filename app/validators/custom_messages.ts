import vine from '@vinejs/vine'

export const authErrorMessages = {
  'password.minLength': 'Le mot de passe doit contenir au moins 8 caractères',
  'password.regex': 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial (@$!%*?&)',
  'email.email': 'Veuillez entrer une adresse email valide',
  'email.unique': 'Cet email est déjà utilisé',
  'fullName.minLength': 'Le nom doit contenir au moins 3 caractères',
}

export const getAuthValidator = () => {
  return vine.compile(
    vine.object({
      fullName: vine.string().trim().minLength(3),
      email: vine.string().email().normalizeEmail().unique({ table: 'users', column: 'email' }),
      password: vine.string().minLength(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
    })
  )
}

export const formatValidationErrors = (errors: any) => {
  const formattedErrors: any = {}
  
  errors.forEach((error: any) => {
    const field = error.field
    let message = authErrorMessages[error.rule as keyof typeof authErrorMessages]
    
    if (!message) {
      // Messages par défaut si pas de traduction
      switch (error.rule) {
        case 'required':
          message = `Le champ ${field} est obligatoire`
          break
        case 'email':
          message = 'Veuillez entrer une adresse email valide'
          break
        case 'minLength':
          message = `Le champ ${field} doit contenir au moins ${error.meta.minLength} caractères`
          break
        case 'unique':
          message = `Cette valeur est déjà utilisée`
          break
        default:
          message = error.message
      }
    }
    
    formattedErrors[field] = message
  })
  
  return formattedErrors
}
