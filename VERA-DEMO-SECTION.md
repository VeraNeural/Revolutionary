# VERA Demo Section - "See VERA in Action"

This document shows the complete HTML and CSS for the interactive demo section to be added to index.html.

## Location in index.html

Insert this section **after the `</main>` closing tag** (after line 980, before `<script>`).

## HTML Structure

```html
<!-- See VERA in Action - Interactive Demo Section -->
<section class="vera-demo-section">
  <div class="demo-container">
    <h2 class="demo-title">See VERA in Action</h2>
    <p class="demo-subtitle">Experience a real conversation with your nervous system companion</p>

    <div class="demo-chat-container">
      <!-- Message 1: User -->
      <div class="demo-message demo-message-user demo-fade-in" style="animation-delay: 0.3s;">
        <div class="demo-message-bubble demo-user-bubble">I feel anxious and disconnected</div>
      </div>

      <!-- Message 2: VERA -->
      <div class="demo-message demo-message-vera demo-fade-in" style="animation-delay: 0.8s;">
        <div class="demo-vera-avatar">
          <div class="demo-avatar-core"></div>
        </div>
        <div class="demo-message-bubble demo-vera-bubble">
          I'm noticing something in how you wrote that - quick, almost rushing past the feeling.
          What's happening in your body right now?
        </div>
      </div>

      <!-- Message 3: User -->
      <div class="demo-message demo-message-user demo-fade-in" style="animation-delay: 1.3s;">
        <div class="demo-message-bubble demo-user-bubble">My chest feels tight...</div>
      </div>

      <!-- Message 4: VERA -->
      <div class="demo-message demo-message-vera demo-fade-in" style="animation-delay: 1.8s;">
        <div class="demo-vera-avatar">
          <div class="demo-avatar-core"></div>
        </div>
        <div class="demo-message-bubble demo-vera-bubble">
          Yes. That tightness - it's not the problem. It's your body trying to tell you something.
          Can you stay with it for a moment?
        </div>
      </div>
    </div>

    <!-- CTA Button -->
    <div class="demo-cta-wrapper demo-fade-in" style="animation-delay: 2.5s;">
      <button class="demo-cta-button" onclick="navigateToChat();">
        Experience VERA Yourself
        <span class="demo-arrow">→</span>
      </button>
    </div>
  </div>
</section>
```

## CSS Styling

Add this to the `<style>` block in index.html (after the hero section styles):

```css
/* ====================================
   VERA DEMO SECTION - "See VERA in Action"
   ==================================== */

.vera-demo-section {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
}

/* Subtle animated background pattern */
.vera-demo-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
  pointer-events: none;
  animation: demoGlowShift 15s ease-in-out infinite;
  z-index: 0;
}

@keyframes demoGlowShift {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

.demo-container {
  position: relative;
  z-index: 1;
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
}

.demo-title {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  color: #fff;
  text-align: center;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.demo-subtitle {
  font-size: clamp(1rem, 2.5vw, 1.2rem);
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  margin-bottom: 3rem;
  font-weight: 300;
}

/* Chat Container */
.demo-chat-container {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24px;
  padding: clamp(1.5rem, 4vw, 2.5rem);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.2),
    0 0 1px rgba(255, 255, 255, 0.5) inset;
  margin-bottom: 3rem;
  backdrop-filter: blur(10px);
  max-height: 600px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(102, 126, 234, 0.3) transparent;
}

.demo-chat-container::-webkit-scrollbar {
  width: 6px;
}

.demo-chat-container::-webkit-scrollbar-track {
  background: transparent;
}

.demo-chat-container::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.demo-chat-container::-webkit-scrollbar-thumb:hover {
  background: rgba(102, 126, 234, 0.5);
}

/* Individual Messages */
.demo-message {
  display: flex;
  margin-bottom: 1.5rem;
  align-items: flex-end;
  gap: 0.75rem;
}

.demo-message-user {
  justify-content: flex-end;
}

.demo-message-vera {
  justify-content: flex-start;
}

/* Message Bubbles */
.demo-message-bubble {
  max-width: 75%;
  padding: 0.875rem 1.125rem;
  border-radius: 18px;
  font-size: 0.95rem;
  line-height: 1.5;
  word-wrap: break-word;
}

.demo-user-bubble {
  background: #667eea;
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.demo-vera-bubble {
  background: #f0f0f0;
  color: #1a1a1a;
  border-radius: 18px 18px 18px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* VERA Avatar */
.demo-vera-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  position: relative;
}

.demo-avatar-core {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 35%,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(177, 156, 217, 0.7) 15%,
    rgba(102, 126, 234, 0.6) 30%,
    transparent 70%
  );
  box-shadow:
    inset 0 0 20px rgba(102, 126, 234, 0.5),
    inset 0 0 40px rgba(177, 156, 217, 0.3);
  animation: demoAvatarPulse 3s ease-in-out infinite;
}

@keyframes demoAvatarPulse {
  0%,
  100% {
    box-shadow:
      inset 0 0 20px rgba(102, 126, 234, 0.5),
      inset 0 0 40px rgba(177, 156, 217, 0.3);
  }
  50% {
    box-shadow:
      inset 0 0 30px rgba(102, 126, 234, 0.7),
      inset 0 0 60px rgba(177, 156, 217, 0.5);
  }
}

/* Fade-in Animation */
@keyframes demoFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.demo-fade-in {
  animation: demoFadeIn 0.6s ease-out forwards;
}

/* CTA Section */
.demo-cta-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
}

.demo-cta-button {
  background: #fff;
  color: #667eea;
  border: none;
  padding: 1rem 2.5rem;
  border-radius: 50px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  letter-spacing: 0.3px;
}

.demo-cta-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  background: #f8f8f8;
}

.demo-cta-button:active {
  transform: translateY(-1px);
}

.demo-arrow {
  display: inline-block;
  transition: transform 0.3s ease-out;
}

.demo-cta-button:hover .demo-arrow {
  transform: translateX(4px);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .vera-demo-section {
    padding: 2.5rem 1.5rem;
    min-height: auto;
  }

  .demo-title {
    margin-bottom: 0.75rem;
  }

  .demo-subtitle {
    margin-bottom: 2rem;
  }

  .demo-chat-container {
    padding: 1.25rem;
    border-radius: 16px;
    margin-bottom: 2rem;
    max-height: 500px;
  }

  .demo-message-bubble {
    max-width: 85%;
    font-size: 0.9rem;
    padding: 0.75rem 1rem;
  }

  .demo-vera-avatar {
    width: 32px;
    height: 32px;
    min-width: 32px;
  }

  .demo-avatar-core {
    width: 24px;
    height: 24px;
  }

  .demo-cta-button {
    padding: 0.875rem 2rem;
    font-size: 0.95rem;
  }

  .demo-message {
    margin-bottom: 1rem;
  }
}

@media (max-width: 480px) {
  .vera-demo-section {
    padding: 2rem 1rem;
  }

  .demo-chat-container {
    padding: 1rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .demo-message-bubble {
    max-width: 90%;
    font-size: 0.85rem;
    padding: 0.65rem 0.9rem;
  }

  .demo-cta-button {
    padding: 0.8rem 1.5rem;
    font-size: 0.9rem;
    gap: 0.5rem;
  }

  .demo-message {
    margin-bottom: 0.8rem;
    gap: 0.5rem;
  }
}

/* Accessibility - Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .vera-demo-section::before,
  .demo-avatar-core,
  .demo-fade-in {
    animation: none !important;
  }

  .demo-message-bubble,
  .demo-cta-button {
    transition: none !important;
  }
}
```

## Integration Steps

1. **Add CSS**: Copy the CSS block above and paste it into the `<style>` section of index.html, after the `.hero` section styles (around line 500-700).

2. **Add HTML**: Copy the HTML section above and paste it into index.html after the `</main>` tag (after line 980, before the `<script>` tag).

3. **Test on Desktop**: Open index.html in browser, scroll down after the hero section to see the demo.

4. **Test on Mobile**: Verify responsive design on small screens.

5. **Verify CTA**: Click the "Experience VERA Yourself" button - should navigate to chat.html.

## Features

✅ **Purple Gradient Background** - Matches VERA theme (#667eea to #764ba2)
✅ **Chat-Style Bubbles** - User messages right-aligned, VERA messages left-aligned
✅ **Animated Avatar Orb** - Mini version of VERA avatar with pulsing animation
✅ **Smooth Fade-in** - Messages appear in sequence with staggered timing
✅ **Responsive Design** - Looks perfect on desktop, tablet, and mobile
✅ **CTA Button** - Links to chat.html with hover animations
✅ **Accessibility** - Respects prefers-reduced-motion, proper contrast
✅ **Consistency** - Uses same styling as chat.html for familiarity

## Message Timing

- User message 1: 0.3s
- VERA message 1: 0.8s
- User message 2: 1.3s
- VERA message 2: 1.8s
- CTA button: 2.5s

(All timings relative to section scroll into view in production, but hardcoded for demo)

## Customization

To change messages, just update the text inside `.demo-message-bubble` elements.

To change colors, update the gradient values in `.vera-demo-section` and `.demo-user-bubble`.

To adjust animation speed, modify the animation delays (in the inline `style="animation-delay"` attributes).
