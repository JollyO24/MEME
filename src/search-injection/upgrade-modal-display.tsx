import React from 'react'
import ReactDOM from 'react-dom'
import styled, { StyleSheetManager, ThemeProvider } from 'styled-components'
import type { MemexThemeVariant } from '@worldbrain/memex-common/lib/common-ui/styles/types'
import {
    loadThemeVariant,
    theme,
} from 'src/common-ui/components/design-library/theme'
import { createInPageUI } from 'src/in-page-ui/utils'
import UpgradeModal from 'src/authentication/upgrade-modal'
import { PowerUpModalVersion } from 'src/authentication/upgrade-modal/types'
import { AuthRemoteFunctionsInterface } from 'src/authentication/background/types'
import { PremiumPlans } from '@worldbrain/memex-common/lib/subscriptions/availablePowerups'
import { Browser } from 'webextension-polyfill'

type RootProps = {
    rootEl: HTMLElement
    shadowRoot: ShadowRoot
    createCheckOutLink: (
        billingPeriod: 'monthly' | 'yearly',
        selectedPremiumPlans: PremiumPlans[],
        doNotOpen: boolean,
    ) => Promise<'error' | 'success'>
    authBG: AuthRemoteFunctionsInterface
    limitReachedNotif: PowerUpModalVersion
    browserAPIs: Browser
}

interface RootState {
    themeVariant: MemexThemeVariant | null
    showUpgradeModal: boolean
    upgradeModalType: PowerUpModalVersion
}

class Root extends React.PureComponent<RootProps, RootState> {
    state: RootState = {
        themeVariant: null,
        showUpgradeModal: false,
        upgradeModalType: 'Bookmarks',
    }

    async componentDidMount() {
        this.setState({
            themeVariant: await loadThemeVariant(),
        })
    }

    private removeRoot = () => {
        const unmountResult = ReactDOM.unmountComponentAtNode(this.props.rootEl)
        if (unmountResult) {
            this.props.rootEl.remove()
        }
    }

    render() {
        if (!this.state.themeVariant) {
            return null
        }
        const { rootEl, shadowRoot, ...props } = this.props
        const memexTheme = theme({ variant: this.state.themeVariant })

        return (
            <StyleSheetManager target={shadowRoot as any}>
                <ThemeProvider theme={memexTheme}>
                    <UpgradeModal
                        getRootElement={() => this.props.rootEl}
                        powerUpType={this.state.upgradeModalType}
                        authBG={this.props.authBG}
                        createCheckOutLink={this.props.createCheckOutLink}
                        componentVariant="Modal"
                        closeComponent={this.removeRoot}
                        limitReachedNotif={this.props.limitReachedNotif}
                        browserAPIs={this.props.browserAPIs}
                    />
                </ThemeProvider>
            </StyleSheetManager>
        )
    }
}

export type UpgradeModalProps = Omit<RootProps, 'rootEl' | 'shadowRoot'>

export const renderUpgradeModal = (props: UpgradeModalProps): void => {
    const { rootElement, shadowRoot } = createInPageUI('upgrade-modal')
    ReactDOM.render(
        <Root rootEl={rootElement} shadowRoot={shadowRoot} {...props} />,
        rootElement,
    )
}
