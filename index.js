import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiPlugin, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";




createApp({

  data() {
    return {
      myMessage: "",
      sending: false,
      groupName: "",
      selectedChannel: null,
      editingMessage: null,
      editContent: "",
      newGroupName: "",
      groupNameObjects: [],
      activeMenu: null,
      showGroupInfo: false,
      groupDescription: 'This is a sample group description.',
      groupMembers: [],
      isLoggedIn: false,
      showProfile: false,
      profileForm: {
        name: "",
        pronouns: "",
        bio: "",
        picture: "./individualavatar.png"
      },
      profileObjects: [],
      showInviteModal: false,
      inviteActor: "",
      membersObjects: []
    };
  },


  setup() {
        const {objects: usersObjects} = useGraffitiDiscover(
          ['users'],
          {
                properties: {
                value: {
                    required: ['activity'],
                    properties: {
                    activity: { const: 'Login' }
                    }
                }
                }
            }
        );
        return { usersObjects }
  },


  methods: {
    async login() {
      await this.$graffiti.login();
      if (!this.usersObjects.includes(this.currentActor)){
        const out = await this.$graffiti.put({value: { activity: 'Login', actor: this.currentActor,}, channels: ['users']}, this.$graffitiSession.value);
      }
       
      console.log("done!")
      console.log(out)
    },
    toggleMessageMenu(message) {
      this.activeMenu = this.activeMenu === message ? null : message;
    },
    async sendMessage(session) {
      if (!this.myMessage || !this.selectedChannel) return;
      this.sending = true;
      await this.$graffiti.put(
        {
          value: {
            content: this.myMessage,
            published: Date.now(),
            
          },
          channels: [this.selectedChannel],
        },
        session
      );
      this.myMessage = "";
      this.sending = false;
      await this.$nextTick();
      this.$refs.messageInput.focus();
    },

    async createGroup(session) {
        const newChannel = crypto.randomUUID();

        // First: create the group
        await this.$graffiti.put(
          {
            value: {
              activity: "Create",
              object: {
                type: "Group Chat",
                name: this.groupName,
                channel: newChannel,
              },
            },
            channels: ["designftw"],
          },
          session
        );
        
        // Then: publish the name-binding object
        await this.$graffiti.put(
          {
            value: {
              name: this.groupName,
              describes: newChannel,
            },
            channels: ["designftw"],
          },
          session
        );
        this.groupMembers = [this.currentActor];

        await this.$graffiti.put({
          channels: [ newChannel ],
          value: {
            activity:  'Members',
            members:   this.groupMembers,
            published: Date.now()
          }
        }, session);
        // Optional: immediately select the group
        this.selectedChannel = newChannel;
        this.groupName = "";
        groupMenu.classList.add('hidden');
        createGroupForm.classList.toggle('hidden');
        createGroupForm.classList.toggle('showing');
    },

    startEdit(message) {
      this.editingMessage = message;
      this.editContent = message.value.content;
    },

    cancelEdit() {
      this.editingMessage = null;
      this.editContent = "";
    },

    async saveEdit(message) {
      await this.$graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/content",
              value: this.editContent,
            },
          ],
        },
        message,
        this.$graffitiSession.value
      );
      this.editingMessage = null;
      this.editContent = "";
    },

    async deleteMessage(message) {
      await this.$graffiti.delete(message, this.$graffitiSession.value);
    },

    async renameGroup() {
      if (!this.newGroupName || !this.selectedChannel) return;
    
      await this.$graffiti.put(
        {
          value: {
            name: this.newGroupName,
            describes: this.selectedChannel,
          },
          channels: ["designftw"],
        },
        this.$graffitiSession.value
      );
    
      this.newGroupName = "";
    

      const latestGroupObjects = await this.$graffiti.query({
        channels: ["designftw"],
        filters: [{ field: "value.describes", equals: this.selectedChannel }],
      });
    
      this.updateGroupNameObjects(latestGroupObjects.objects);
    },

    getGroupName(channel) {
        const matches = this.groupNameObjects
          .filter((obj) => obj.value.describes === channel);
      
        if (matches.length === 0) return null;
      
        // Pick the one with latest timestamp (if present)
        const latest = matches.reduce((a, b) => {
          const aTime = a.value.published ?? a.timestamp ?? 0;
          const bTime = b.value.published ?? b.timestamp ?? 0;
          return aTime > bTime ? a : b;
        });
      
        return latest.value.name;
    },

    updateGroupNameObjects(objs) {
      this.groupNameObjects = objs;
    },

    async saveProfile() {
      if (!this.currentActor) return;
      const profileObj = {
        name:      this.profileForm.name,
        pronouns:  this.profileForm.pronouns,
        bio:       this.profileForm.bio,
        picture:   this.profileForm.picture,      // ← añadimos aquí
        describes: this.currentActor,
        published: Date.now(),
      };
      await this.$graffiti.put(
        { value: profileObj, channels: [ this.currentActor ] },
        this.$graffitiSession.value
      );
      alert("¡Perfil guardado!");
      this.showProfile = false;
    },

    async loadProfile() {
      if (!this.currentActor) return;

      // Obtén todos los objetos en tu canal
      const res = await this.$graffiti.query({
        channels: [this.currentActor],
      });

      // Filtra solo los que describen a tu actor
      const objs = res.objects.filter(
        (o) => o.value.describes === this.currentActor
      );

      if (!objs.length) return;

      // Elige el más reciente
      const latest = objs.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );

      // Rellena el formulario
      this.profileForm.name     = latest.value.name;
      this.profileForm.pronouns = latest.value.pronouns;
      this.profileForm.bio      = latest.value.bio;
    },

    onFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.profileForm.picture = e.target.result;  // data URL
      };
      reader.readAsDataURL(file);
    },

    async recordLogin(session) {
      await this.$graffiti.put({
        value: {
          activity: "Login",
          actor:    session.actor,
          published: Date.now()
        },
        channels: ["users"],
      }, session);
    },

    openInvite() {
      this.inviteActor = "";
      this.showInviteModal = true;
    },
    closeInvite() {
      this.showInviteModal = false;
      this.inviteActor = "";
    },

    async sendInvite() {
      console.log(this.usersObjects);
      const entered = this.inviteActor.trim();
      if (!entered) {
        return alert("❌ Please enter a valid username");
      }
  

      console.log("output de:", this.allUsers);
      let target = this.allUsers.find(u => u === entered);

      if (!target || this.groupMembers.includes(target)) {
        return alert("❌ Couldn't send invitation to “${entered}”, the user either doesn't exist or is already in the group chat");
      }
  

      await this.$graffiti.put({
        value: {
          activity:  "Invite",
          group:     this.selectedChannel,
          from:      this.currentActor,
          published: Date.now()
        },
        channels: [ target ]
      }, this.$graffitiSession.value);
  

      if (!this.groupMembers.includes(target)) {
        this.groupMembers.push(target);
        await this.saveGroupMembers();
      }
  
      alert("✅ Invitation sent to ${target}, user will be added if they accept the invitation");
      this.closeInvite();
    },



    async saveGroupMembers() {
      if (!this.selectedChannel) return;
      await this.$graffiti.put({
        channels: [ this.selectedChannel ],
        value: {
          activity:  'Members',
          members:   this.groupMembers,
          published: Date.now()
        }
      }, this.$graffitiSession.value);
    },
  
    
    updateMembers(objs) {
      // objs viene del discover: array de todos los events "Members"
      if (!Array.isArray(objs)) {
        this.groupMembers = [];
        return;
      }
      // Solo los events “Members”
      const mine = objs.filter(o => o.value.activity === 'Members');
      if (!mine.length) {
        this.groupMembers = [];
        return;
      }
      // Elegimos el más reciente
      const latest = mine.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
      this.groupMembers = [ ...latest.value.members ];
    },

    memberAvatar(objects) {
      if (!objects.length) {
        return './individualavatar.png';
      }
      const latest = objects.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
      return latest.value.picture || './individualavatar.png';
    }
    
  },

  watch: {
     $graffitiSession(session) {
      this.loadProfile();
    },
    $graffitiSession: {
      handler(session) {
        if (session) this.recordLogin(session);
      },
      immediate: true
    },
    currentActor(newA, oldA) {
      if (newA && newA !== oldA) {
        this.profileForm = { name: "", pronouns: "", bio: "", picture: "" };
        this.profileObjects = [];
      }
    },
    profileObjects(objs) {
      if (!objs?.length) return;
      const mine = objs.filter(o => o.value.describes === this.currentActor);
      if (!mine.length) return;
      const latest = mine.reduce((a,b) =>
        a.value.published > b.value.published ? a : b
      );
      Object.assign(this.profileForm, {
        name:     latest.value.name,
        pronouns: latest.value.pronouns,
        bio:      latest.value.bio,
        picture:  latest.value.picture || ""
      });
    },

    membersObjects: {
        handler(objs) {
          this.updateMembers(Array.isArray(objs) ? objs : []);
        },
        immediate: true
      }


  },

  computed: {
    currentActor() {
      return this.$graffitiSession.value?.actor ?? null;
    },
    allUsers() {
      return this.usersObjects.map((o) => o.actor);
    }
  },

  mounted() {
    this.loadProfile();
    const unwatch = this.$watch(
      () => this.$refs.groupNameDiscover?.$data?.objects,
      (newObjects) => {
        if (newObjects) this.groupNameObjects = newObjects;
      },
      { immediate: true }
      
    );

    this.$watch(
      () => this.$refs.profileDiscover?.$data.objects,
      (objs) => {
        if (!objs || objs.length === 0) return;
        // Elegir el objeto más reciente según published
        const latest = objs.reduce((a, b) =>
          (a.value.published > b.value.published ? a : b)
        );
        this.profileForm.name     = latest.value.name;
        this.profileForm.pronouns = latest.value.pronouns;
        this.profileForm.bio      = latest.value.bio;
      },
      { immediate: true }

    );

    this.$nextTick(() => {
      this.$watch(
        () => this.$refs.profileDiscover?.$data.objects,
        (objs) => {
          if (!objs?.length) return;
          const mine = objs.filter(
            (o) => o.value.describes === this.currentActor
          );
          if (!mine.length) return;
          const latest = mine.reduce((a, b) =>
            a.value.published > b.value.published ? a : b
          );

          this.profileForm.name     = latest.value.name;
          this.profileForm.pronouns = latest.value.pronouns;
          this.profileForm.bio      = latest.value.bio;
        },
        { immediate: true }
      );
    });

    const session = this.$graffitiSession.value;
    if (session) {
      this.recordLogin(session);}


    this.$watch(
      () => this.$refs.usersDiscover?.$data.objects,
      (objs) => {
        if (Array.isArray(objs)) {
          this.usersObjects = objs;
          console.log("🚀 usersObjects actualizados:", objs);
        }
      },
      { immediate: true }
    );

    this.$watch(
      () => this.$refs.membersDiscover?.$data.objects,
      (objs) => {
        this.updateMembers(Array.isArray(objs) ? objs : []);
      },
      { immediate: true }
    );
  },

})
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(),
  })
  .mount("#app");

const toggleMenuBtn = document.getElementById('toggleGroupMenu');
const groupMenu = document.getElementById('groupMenu');
const showCreateFormBtn = document.getElementById('showCreateForm');
const createGroupForm = document.getElementById('createGroupForm');

toggleMenuBtn.addEventListener('click', () => {
  groupMenu.classList.toggle('hidden');
});

showCreateFormBtn.addEventListener('click', () => {
  groupMenu.classList.add('hidden');
  createGroupForm.classList.toggle('hidden');
  createGroupForm.classList.toggle('showing');
});