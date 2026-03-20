describe('Home Page', () => {
  it('should load the home page', () => {
    cy.visit('/')
    cy.url().should('include', '/')
  })

  it('should have a visible body', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')
  })
})
